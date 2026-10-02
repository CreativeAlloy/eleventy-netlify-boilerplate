import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Identity comes from the signed token ONLY, never from the request body.
  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { slug, comment_body } = await req.json();

    if (!slug || !comment_body || !comment_body.trim()) {
      return new Response("Invalid comment data", { status: 400 });
    }

    const cleanBody = comment_body.trim().slice(0, 5000);

    // Resolve verified profile URL on the server side
    let authorUrl = null;
    const userHandle = session.handle || session.username;

    if (session.provider === "instagram" && userHandle) {
      authorUrl = `https://instagram.com/${encodeURIComponent(userHandle)}`;
    } else if (session.provider === "discord" && session.provider_user_id) {
      // Discord profile links are keyed by the numeric user ID (handles can change)
      authorUrl = `https://discord.com/users/${encodeURIComponent(session.provider_user_id)}`;
    } else if (session.provider === "github" && session.provider_user_id) {
      try {
        const ghRes = await fetch(`https://api.github.com/user/${encodeURIComponent(session.provider_user_id)}`, {
          headers: {
            "Accept": "application/vnd.github+json",
            "User-Agent": "TheWaspAlloy-App"
          }
        });
        if (ghRes.ok) {
          const ghData = await ghRes.json();
          authorUrl = ghData.html_url || null;
        }
      } catch (err) {
        console.error("Failed to resolve GitHub profile URL:", err);
      }
    }

    const AVATAR_HOSTS = ["cdn.discordapp.com", "avatars.githubusercontent.com"];
    let avatarUrl = null;
    try {
      const u = new URL(session.avatar_url || "");
      if (u.protocol === "https:" && AVATAR_HOSTS.includes(u.hostname)) avatarUrl = u.href;
    } catch {
      avatarUrl = null;
    }

    // Check the timestamp of the user's most recent comment in Neon
    const [lastPost] = await sql`
      SELECT created_at FROM twa_comments
      WHERE provider = ${session.provider} AND provider_user_id = ${session.provider_user_id}
      ORDER BY created_at DESC LIMIT 1;
    `;

    if (lastPost && (Date.now() - new Date(lastPost.created_at).getTime()) < 30000) {
      return new Response("Slow down! You can only post once every 30 seconds.", { status: 429 });
    }

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, author_url, avatar_url)
      VALUES (${slug}, ${session.username}, ${session.provider}, ${session.provider_user_id}, ${cleanBody}, ${authorUrl}, ${avatarUrl})
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, created_at, is_deleted, mod_badge, author_url, avatar_url;
    `;

    return Response.json({ comment: result[0] });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
