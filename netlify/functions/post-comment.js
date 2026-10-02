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
    const { slug, comment_body, stars } = await req.json();

    if (!slug || !comment_body || !comment_body.trim()) {
      return new Response("Invalid comment data", { status: 400 });
    }

    const cleanBody = comment_body.trim().slice(0, 5000);
    const cleanStars = Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 5;

    // Resolve verified profile URL on the server side
    let authorUrl = null;
    const userHandle = session.handle || session.username;

    if (session.provider === "instagram" && userHandle) {
      authorUrl = `https://instagram.com/${encodeURIComponent(userHandle)}`;
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

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, stars, author_url)
      VALUES (${slug}, ${session.username}, ${session.provider}, ${session.provider_user_id}, ${cleanBody}, ${cleanStars}, ${authorUrl})
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, stars, created_at, is_deleted, mod_badge, author_url;
    `;

    return Response.json({ comment: result[0] });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
