import { authToken, cookieName } from "./_middleware.js";

// Rate limit login attempts per IP so the password can't be ground down.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = "login:" + ip;
  const seen = (await env.BUDGET_KV.get(key, "json")) || { n: 0, until: 0 };

  if (seen.n >= MAX_ATTEMPTS && seen.until > Date.now()) {
    return Response.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  let password = "";
  try {
    ({ password } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  if (password !== env.APP_PASSWORD) {
    await env.BUDGET_KV.put(
      key,
      JSON.stringify({ n: seen.until > Date.now() ? seen.n + 1 : 1, until: Date.now() + WINDOW_MS }),
      { expirationTtl: 120 },
    );
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }

  await env.BUDGET_KV.delete(key);
  const token = await authToken(env.APP_PASSWORD);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${180 * 86400}`,
    },
  });
}
