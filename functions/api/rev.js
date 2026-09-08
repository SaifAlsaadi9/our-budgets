// Just the version number, so a device can poll for "did anything change?"
// without pulling the whole budget down every few seconds.

const KEY = "state";

export async function onRequestGet({ env }) {
  const doc = await env.BUDGET_KV.get(KEY, "json");
  const rev = doc && typeof doc.rev === "number" ? doc.rev : 0;
  const updatedAt = (doc && doc.updatedAt) || null;
  return new Response(JSON.stringify({ rev, updatedAt }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
