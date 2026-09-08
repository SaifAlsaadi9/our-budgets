// The whole budget state as one versioned document: settings, months, debts.
//
// Every write carries the revision it was based on. If the stored revision has
// moved on, another device saved first — the write is refused and the current
// document handed back, so a stale tab can never silently flatten newer data.

const KEY = "state";

// Documents written before versioning existed hold the state directly.
function unwrap(doc) {
  if (!doc) return null;
  return typeof doc.rev === "number" ? doc : { rev: 0, data: doc, updatedAt: null };
}

export async function onRequestGet({ env }) {
  const doc = unwrap(await env.BUDGET_KV.get(KEY, "json"));
  if (!doc) return Response.json(null);
  return Response.json({ rev: doc.rev, updatedAt: doc.updatedAt, data: doc.data });
}

export async function onRequestPut({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const data = body && body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return Response.json({ error: "Expected a data object" }, { status: 400 });
  }

  const current = unwrap(await env.BUDGET_KV.get(KEY, "json"));
  const currentRev = current ? current.rev : 0;

  if (current && Number(body.rev) !== currentRev) {
    return Response.json(
      { error: "conflict", rev: currentRev, updatedAt: current.updatedAt, data: current.data },
      { status: 409 },
    );
  }

  const next = { rev: currentRev + 1, updatedAt: new Date().toISOString(), data };
  await env.BUDGET_KV.put(KEY, JSON.stringify(next));
  return Response.json({ ok: true, rev: next.rev, updatedAt: next.updatedAt });
}
