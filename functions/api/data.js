// The whole budget state as one document: settings, months, debts.
// Small enough that splitting it would only add failure modes.

const KEY = "state";

export async function onRequestGet({ env }) {
  const state = await env.BUDGET_KV.get(KEY, "json");
  return Response.json(state || null);
}

export async function onRequestPut({ request, env }) {
  let state;
  try {
    state = await request.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return Response.json({ error: "Expected an object" }, { status: 400 });
  }

  await env.BUDGET_KV.put(KEY, JSON.stringify(state));
  return Response.json({ ok: true });
}
