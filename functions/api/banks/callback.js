import { createSession } from "../../../src/enablebanking.js";

const LINKS_KEY = "links";

// The bank sends the browser back here with ?code=&state=. No cookie is
// guaranteed to survive that round trip, so this route is public — it only
// completes a link the app itself started, matched on the state we generated.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const done = (ok, reason) =>
    Response.redirect(url.origin + "/?linked=" + (ok ? "1" : "0") + (reason ? "&why=" + reason : ""), 302);

  if (!code || !state) return done(false, "cancelled");

  const links = (await env.BUDGET_KV.get(LINKS_KEY, "json")) || [];
  const link = links.find((l) => l.state === state);
  if (!link) return done(false, "unknown");

  try {
    const session = await createSession(env, code);
    const accounts = session?.accounts || [];

    if (!accounts.length) {
      // Restricted Production returns nothing for accounts that were never
      // whitelisted in the Enable Banking control panel.
      link.status = "not_whitelisted";
      await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links));
      return done(false, "whitelist");
    }

    link.sessionId = session.session_id || session.uid || null;
    link.accounts = accounts.map((a) => ({
      uid: a.uid,
      name: a.name || a.product || a.account_id?.iban || "Account",
      lastSync: null,
    }));
    link.status = "linked";
    link.linkedAt = new Date().toISOString();

    await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links));
    return done(true);
  } catch (err) {
    link.status = "error";
    link.error = String(err.message).slice(0, 300);
    await env.BUDGET_KV.put(LINKS_KEY, JSON.stringify(links));
    return done(false, "error");
  }
}
