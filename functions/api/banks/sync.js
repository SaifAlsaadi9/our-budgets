import { getAllTransactions, EbError } from "../../../src/enablebanking.js";
import { normalise, DEFAULT_RULES } from "../../../src/mapping.js";

const LINKS_KEY = "links";
const STATE_KEY = "state";

const monthOf = (iso) => iso.slice(0, 7);

export async function onRequestPost({ env }) {
  const links = (await env.BUDGET_KV.get(LINKS_KEY, "json")) || [];
  const linked = links.filter((l) => l.status === "linked");
  if (!linked.length) return Response.json({ error: "No bank linked yet." }, { status: 400 });

  const state = (await env.BUDGET_KV.get(STATE_KEY, "json")) || { settings: {}, months: {}, debts: [] };
  state.months = state.months || {};
  const rules = [...(state.settings?.rules || []), ...DEFAULT_RULES];

  // Every id already imported, so a re-sync can't double-count.
  const seen = new Set();
  for (const key of Object.keys(state.months)) {
    for (const t of state.months[key].txns || []) if (t.id) seen.add(t.id);
  }

  let added = 0;
  const errors = [];
  let sample = null;

  for (const link of linked) {
    for (const account of link.accounts) {
      // Re-ask for a week around the last sync: banks can book late.
      const from = account.lastSync
        ? new Date(Date.parse(account.lastSync) - 7 * 86400_000).toISOString().slice(0, 10)
        : null;
      try {
        const rows = await getAllTransactions(env, account.uid, from);
        if (!sample && rows.length) sample = Object.keys(rows[0]);

        for (const raw of rows) {
          const tx = normalise(raw, rules);
          if (!tx.date || !tx.amt || seen.has(tx.id)) continue;
          const key = monthOf(tx.date);
          state.months[key] = state.months[key] || { txns: [] };
          state.months[key].txns.push(tx);
          seen.add(tx.id);
          added++;
        }
        account.lastSync = new Date().toISOString();
      } catch (err) {
        const status = err instanceof EbError ? err.status : 0;
        if (status === 401 || status === 403) {
          link.status = "expired";
          errors.push(`${link.bankName}: access expired, reconnect the bank.`);
        } else if (status === 429) {
          errors.push(`${link.bankName}: rate limit reached, try again later.`);
        } else {
          errors.push(`${link.bankName}: ${err.message}`);
        }
      }
    }
  }

  if (added) await env.BUDGET_KV.put(STATE_KEY, JSON.stringify(state));
  await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links));

  // Field names of the first transaction seen, so a mapping mismatch shows up
  // on the first live run instead of silently importing nothing.
  return Response.json({ added, errors, sampleFields: sample });
}
