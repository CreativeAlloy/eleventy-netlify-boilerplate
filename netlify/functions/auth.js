export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const code = url.searchParams.get("code");

  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const ADMIN_ID = process.env.ADMIN_GITHUB_ID;

  // Determine current host dynamically (works both on localhost:8888 and live domain)
  const redirectUri = `${url.origin}/.netlify/functions/auth`;

  // --- Step A: User clicked "Sign In" ➔ Redirect them to GitHub ---
  if (action === "login") {
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
    return Response.redirect(githubAuthUrl, 302);
  }

  // --- Step B: GitHub redirected back with a temporary authorization code ---
  if (code) {
    try {
      // 1. Exchange temporary code for GitHub access token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code,
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error || !tokenData.access_token) {
        throw new Error(tokenData.error_description || "Failed to retrieve access token");
      }

      // 2. Fetch public user profile using the access token
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "User-Agent": "TheWaspAlloy-Auth"
        }
      });

      const userData = await userResponse.json();

      // 3. Determine if this user is the Site Developer / Moderator
      const isModerator = ADMIN_ID && (
        String(userData.login).toLowerCase() === String(ADMIN_ID).toLowerCase() ||
        String(userData.id) === String(ADMIN_ID)
      );

      // Prioritize public Display Name ("Sufian M'Barki"), fallback to handle ("CreativeAlloy")
      const displayName = userData.name && userData.name.trim() ? userData.name.trim() : userData.login;

      const payload = {
        provider: "github",
        provider_user_id: String(userData.id),
        username: displayName,
        handle: userData.login,
        avatar_url: userData.avatar_url,
        role: isModerator ? "moderator" : "user"
      };

      // 4. Return an HTML script that transmits the payload to the main window and closes the popup
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head><title>Authenticating...</title></head>
        <body style="background:#0b193b; color:#fff; font-family:sans-serif; text-align:center; padding:2rem;">
          <script>
            const authPayload = ${JSON.stringify(payload)};
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

      return new Response(htmlResponse, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });

    } catch (err) {
      console.error("OAuth Exchange Error:", err);
      return new Response(`Authentication Error: ${err.message}`, { status: 500 });
    }
  }

  return new Response("Invalid auth request", { status: 400 });
};
