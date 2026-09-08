const LINKS_KEY = "links";

const LABELS = {
  linked: "Linked",
  pending: "Pending",
  expired: "Expired",
  error: "Error",
  not_whitelisted: "Not whitelisted",
};

export async function onRequestGet({ env }) {
  const links = (await env.BUDGET_KV.get(LINKS_KEY, "json")) || [];
  const today = new Date().toISOString().slice(0, 10);

  return Response.json({
    links: links.map((l) => ({
      state: l.state,
      bankName: l.bankName,
      status: l.status,
      label: LABELS[l.status] || l.status,
      error: l.error || null,
      expiresAt: l.expiresAt,
      expired: l.status === "expired" || Boolean(l.expiresAt && l.expiresAt < today),
      accounts: l.accounts?.length || 0,
      lastSync: l.accounts?.reduce((a, x) => (x.lastSync > a ? x.lastSync : a), null) || null,
    })),
  });
}

export async function onRequestDelete({ request, env }) {
  let state;
  try {
    ({ state } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const links = (await env.BUDGET_KV.get(LINKS_KEY, "json")) || [];
  await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links.filter((l) => l.state !== state)));
  return Response.json({ ok: true });
}
