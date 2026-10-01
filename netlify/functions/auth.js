// netlify/functions/auth.js
// Stateless OAuth handshake for GitHub + Instagram (popup flow).
//
// The OAuth `state` parameter is "<provider>.<nonce>". The provider tells the callback
// which exchange to run; the nonce is matched against a cookie set at login time.

import { randomBytes } from "node:crypto";
import { signSession } from "../lib/session.js";

const SUPPORTED = ["github", "instagram"];

// Instagram API with Instagram Login (the Basic Display API was shut down).
// If Meta changes endpoints again, this is the only block to touch.
const IG = {
  authorize: "https://www.instagram.com/oauth/authorize",
  token: "https://api.instagram.com/oauth/access_token",
  me: "https://graph.instagram.com/me",
  scope: "instagram_business_basic"
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function successPage(payload) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Authenticating...</title></head>
    <body style="background:#0b193b; color:#fff; font-family:sans-serif; text-align:center; padding:2rem;">
      <script>
        const authPayload = ${JSON.stringify({ ...payload, token: signSession(payload) }).replace(/</g, "\\u003c")};
        if (window.opener) {
          window.opener.postMessage({ type: 'TWA_AUTH_SUCCESS', data: authPayload }, window.location.origin);
          window.close();
        } else {
          localStorage.setItem('twa_auth', JSON.stringify(authPayload));
          window.location.href = '/';
        }
      </script>
      <p>Authentication verified! Closing window...</p>
    </body>
    </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------------------------------------------------------------------------
// GitHub (unchanged logic)
// ---------------------------------------------------------------------------
async function githubProfile(code, redirectUri) {
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const ADMIN_ID = process.env.ADMIN_GITHUB_ID;

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: redirectUri })
  });
  const tokenData = await tokenResponse.json();
  if (tokenData.error || !tokenData.access_token) {
    throw new Error(tokenData.error_description || "Failed to retrieve access token");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: { "Authorization": `Bearer ${tokenData.access_token}`, "User-Agent": "TheWaspAlloy-Auth" }
  });
  const userData = await userResponse.json();

  const isModerator = ADMIN_ID && (
    String(userData.login).toLowerCase() === String(ADMIN_ID).toLowerCase() ||
    String(userData.id) === String(ADMIN_ID)
  );
  const displayName = userData.name && userData.name.trim() ? userData.name.trim() : userData.login;

  return {
    provider: "github",
    provider_user_id: String(userData.id),
    username: displayName,
    handle: userData.login,
    avatar_url: userData.avatar_url,
    role: isModerator ? "moderator" : "user"
  };
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------
async function instagramProfile(code, redirectUri) {
  const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
  const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
  const AUTHOR_ID = process.env.AUTHOR_INSTAGRAM_USER_ID;

  // Instagram appends "#_" to the code; make sure it never reaches the exchange.
  const cleanCode = code.replace(/#_$/, "");

  // 1. Exchange code for access token (form-encoded POST)
  const tokenResponse = await fetch(IG.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: cleanCode
    })
  });
  const tokenJson = await tokenResponse.json();

  // Response is either { access_token, user_id } or { data: [{ access_token, user_id }] }
  const tokenData = Array.isArray(tokenJson.data) ? tokenJson.data[0] : tokenJson;
  if (!tokenResponse.ok || !tokenData || !tokenData.access_token) {
    throw new Error(tokenJson.error_message || tokenJson.error?.message || "Failed to retrieve Instagram access token");
  }

  // 2. Fetch the profile
  const meResponse = await fetch(
    `${IG.me}?fields=user_id,username&access_token=${encodeURIComponent(tokenData.access_token)}`
  );
  const userData = await meResponse.json();
  if (!meResponse.ok || !userData.username) {
    throw new Error(userData.error?.message || "Failed to retrieve Instagram profile");
  }

  // 3. Author detection by STABLE numeric ID (handles can be renamed / re-claimed)
  const igUserId = String(userData.user_id || userData.id || tokenData.user_id);
  const isAuthor = AUTHOR_ID && igUserId === String(AUTHOR_ID);

  return {
    provider: "instagram",
    provider_user_id: igUserId,
    username: userData.username,
    handle: userData.username,
    avatar_url: "",
    role: isAuthor ? "author" : "user"
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  // Works on localhost:8888 and on the live domain
  const redirectUri = `${url.origin}/.netlify/functions/auth`;

  // --- Step A: user clicked "Sign in" -> redirect to the chosen provider ---
  if (action === "login") {
    const provider = url.searchParams.get("provider") || "github";
    if (!SUPPORTED.includes(provider)) {
      return new Response("Unsupported provider", { status: 400 });
    }

    // Random value tied to THIS browser (cookie) and echoed back via `state`.
    // Stops an attacker from tricking someone into finishing the attacker's login.
    const nonce = randomBytes(16).toString("hex");
    const state = `${provider}.${nonce}`;

    const providerAuthUrl = provider === "instagram"
      ? `${IG.authorize}?client_id=${encodeURIComponent(process.env.INSTAGRAM_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code&scope=${IG.scope}&state=${state}`
      : `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user&state=${state}`;

    const secure = url.protocol === "https:" ? "; Secure" : ""; // allows http://localhost testing
    return new Response(null, {
      status: 302,
      headers: {
        Location: providerAuthUrl,
        "Set-Cookie": `twa_oauth=${nonce}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/.netlify/functions/auth${secure}`
      }
    });
  }

  // --- User denied access on the provider's consent screen ---
  if (oauthError) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0b193b;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;">
        <p>Sign-in was cancelled.</p><script>setTimeout(() => window.close(), 1500);</script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // --- Step B: provider redirected back with an authorization code ---
  if (code) {
    const [provider, nonce] = (url.searchParams.get("state") || "").split(".");
    const cookieNonce = /(?:^|;\s*)twa_oauth=([a-f0-9]+)/.exec(req.headers.get("cookie") || "")?.[1];

    if (!SUPPORTED.includes(provider) || !nonce || nonce !== cookieNonce) {
      return new Response("Invalid login state. Please close this window and try again.", { status: 400 });
    }

    try {
      const payload = provider === "instagram"
        ? await instagramProfile(code, redirectUri)
        : await githubProfile(code, redirectUri);

      const response = successPage(payload);
      // Nonce is single-use: clear it
      response.headers.append("Set-Cookie", "twa_oauth=; Max-Age=0; Path=/.netlify/functions/auth");
      return response;
    } catch (err) {
      console.error(`OAuth Exchange Error (${provider}):`, err);
      return new Response(`Authentication Error: ${escapeHtml(err.message)}`, { status: 500 });
    }
  }

  return new Response("Invalid auth request", { status: 400 });
};
