// Enable Banking API client.
// Docs: https://enablebanking.com/docs/api/
//
// Auth is a self-signed RS256 JWT: the `kid` is your application ID and the
// signature uses the private key downloaded when the application was registered.
// There is no token endpoint to call.

const BASE = "https://api.enablebanking.com";

class EbError extends Error {
  constructor(status, body) {
    super("Enable Banking " + status + ": " + body);
    this.status = status;
    this.body = body;
  }
}

function b64url(bytes) {
  let s = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Signing is cheap, but an isolate handling a burst shouldn't redo it each time.
let cached = { jwt: null, exp: 0 };

async function jwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.jwt && cached.exp > now + 60) return cached.jwt;

  if (!env.ENABLE_BANKING_APP_ID || !env.ENABLE_BANKING_PRIVATE_KEY) {
    throw new EbError(500, "ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY are not set");
  }

  // Cloudflare's secret editor may store the PEM with escaped newlines.
  const pem = env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, "\n").trim();

  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new EbError(500, "The private key isn't valid PKCS#8 PEM. Paste the .pem file exactly as downloaded.");
  }

  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const exp = now + 3600;
  const signingInput =
    enc({ typ: "JWT", alg: "RS256", kid: env.ENABLE_BANKING_APP_ID }) +
    "." +
    enc({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp });

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  cached = { jwt: signingInput + "." + b64url(sig), exp };
  return cached.jwt;
}

async function call(env, path, options = {}) {
  const token = await jwt(env);
  const res = await fetch(BASE + path, {
    method: options.method || "GET",
    headers: {
      authorization: "Bearer " + token,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new EbError(res.status, text);
  return text ? JSON.parse(text) : null;
}

// Banks are addressed by name + country, not by an opaque id.
export async function listBanks(env, country = "GB") {
  const data = await call(env, "/aspsps?country=" + encodeURIComponent(country));
  return (data.aspsps || [])
    .filter((a) => !a.psu_types || a.psu_types.includes("personal"))
    .map((a) => ({ id: a.name, name: a.name, country: a.country || country, logo: a.logo || null }));
}

// Returns { url } — send the browser there; the bank handles consent.
export async function startAuth(env, bankName, country, redirectUrl, state) {
  const validUntil = new Date(Date.now() + 90 * 86400_000).toISOString();
  return call(env, "/auth", {
    method: "POST",
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: bankName, country },
      state,
      redirect_url: redirectUrl,
      psu_type: "personal",
    },
  });
}

// Exchange the code from the bank redirect for a session and its accounts.
// On Restricted Production only accounts whitelisted in the control panel
// come back — an empty list means the account wasn't whitelisted.
export function createSession(env, code) {
  return call(env, "/sessions", { method: "POST", body: { code } });
}

export function getTransactionsPage(env, accountUid, { dateFrom, continuationKey } = {}) {
  const q = new URLSearchParams();
  if (dateFrom) q.set("date_from", dateFrom);
  if (continuationKey) q.set("continuation_key", continuationKey);
  const qs = q.toString();
  return call(env, "/accounts/" + encodeURIComponent(accountUid) + "/transactions" + (qs ? "?" + qs : ""));
}

// Walks the continuation keys, with a hard page cap so a bad key can't spin.
export async function getAllTransactions(env, accountUid, dateFrom) {
  const out = [];
  let key = null;
  for (let page = 0; page < 10; page++) {
    const res = await getTransactionsPage(env, accountUid, { dateFrom, continuationKey: key });
    out.push(...(res?.transactions || []));
    key = res?.continuation_key;
    if (!key) break;
  }
  return out;
}

export function getBalances(env, accountUid) {
  return call(env, "/accounts/" + encodeURIComponent(accountUid) + "/balances");
}

export { EbError };
