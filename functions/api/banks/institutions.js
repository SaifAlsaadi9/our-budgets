import { listBanks, EbError } from "../../../src/enablebanking.js";

export async function onRequestGet({ env, request }) {
  const country = (new URL(request.url).searchParams.get("country") || "GB").toUpperCase();
  try {
    const banks = await listBanks(env, country);
    banks.sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ banks });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err instanceof EbError ? 502 : 500 });
  }
}
