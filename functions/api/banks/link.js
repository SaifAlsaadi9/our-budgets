import { startAuth, EbError } from "../../../src/enablebanking.js";

const LINKS_KEY = "links";

export async function onRequestPost({ request, env }) {
  let bankName, country;
  try {
    ({ bankName, country } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!bankName) return Response.json({ error: "Pick a bank first." }, { status: 400 });

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();

  try {
    const auth = await startAuth(env, bankName, (country || "GB").toUpperCase(), origin + "/api/banks/callback", state);

    const links = (await env.BUDGET_KV.get(LINKS_KEY, "json")) || [];
    links.push({
      state,
      bankName,
      country: (country || "GB").toUpperCase(),
      status: "pending",
      // UK consent is capped at 90 days; the bank enforces it.
      expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10),
      accounts: [],
      createdAt: new Date().toISOString(),
    });
    await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links));

    return Response.json({ link: auth.url, state });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err instanceof EbError ? 502 : 500 });
  }
}
