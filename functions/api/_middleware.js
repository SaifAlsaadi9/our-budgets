// Password gate for every /api route.
//
// Fails CLOSED: with no APP_PASSWORD set the API returns 503 rather than serving
// bank data from an open URL.

const COOKIE = "ob_auth";

export async function authToken(password) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("our-budgets-v1"));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const cookieName = COOKIE;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!env.APP_PASSWORD) {
    return Response.json(
      { error: "setup", message: "Set APP_PASSWORD in the Pages environment variables, then redeploy." },
      { status: 503 },
    );
  }

  // Logging in and returning from the bank both happen before there is a cookie.
  if (url.pathname === "/api/login" || url.pathname === "/api/banks/callback") {
    return next();
  }

  const expected = await authToken(env.APP_PASSWORD);
  if (!timingSafeEqual(readCookie(request, COOKIE) || "", expected)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  return next();
}
