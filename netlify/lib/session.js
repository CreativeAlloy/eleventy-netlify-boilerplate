// netlify/lib/session.js
// Signed session tokens (HMAC-SHA256). Lives OUTSIDE netlify/functions so
// Netlify doesn't deploy it as an endpoint; esbuild bundles it into each
// function that imports it.
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(body) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return createHmac("sha256", secret).update(body).digest();
}

// Called ONLY from auth.js, after the provider has verified the user.
export function signSession(user) {
  const claims = {
    provider: user.provider,
    provider_user_id: String(user.provider_user_id),
    username: user.username,
    handle: user.handle,
    avatar_url: user.avatar_url || "",
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  };
  const body = b64url(JSON.stringify(claims));
  return `${body}.${b64url(sign(body))}`;
}

// Returns the verified claims, or null if missing / forged / expired.
export function verifySession(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;

    const expected = sign(body);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
