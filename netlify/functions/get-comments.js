import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

const round1 = (n) => Math.round(Number(n) * 10) / 10;

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const slug = params.get("slug");

  if (!slug) {
    return new Response("Missing slug parameter", { status: 400 });
  }

  // Public endpoint: a valid token only adds "my_rating"; no token is fine.
  const viewer = verifySession(req);
  const viewerProvider = viewer ? viewer.provider : null;
  const viewerId = viewer ? String(viewer.provider_user_id) : null;

  try {
    const comments = await sql`
      SELECT c.id, c.post_slug, c.author_name, c.provider, c.provider_user_id, c.comment_body,
             c.created_at, c.is_deleted, c.mod_badge, c.author_url, c.avatar_url,
             r.rating_avg, COALESCE(r.rating_count, 0) AS rating_count,
             m.rating AS my_rating
      FROM twa_comments c
      LEFT JOIN (
        SELECT comment_id, AVG(rating) AS rating_avg, COUNT(*) AS rating_count
        FROM twa_comment_ratings
        WHERE comment_id IN (SELECT id FROM twa_comments WHERE post_slug = ${slug})
        GROUP BY comment_id
      ) r ON r.comment_id = c.id
      LEFT JOIN twa_comment_ratings m
        ON m.comment_id = c.id
       AND m.provider = ${viewerProvider}
       AND m.provider_user_id = ${viewerId}
      WHERE c.post_slug = ${slug}
      ORDER BY c.created_at DESC;
    `;

    // Admin status is resolved here so the admin IDs never ship to the browser.
    const adminGithub = String(process.env.ADMIN_GITHUB_ID || "").trim().toLowerCase();
    const adminDiscord = String(process.env.ADMIN_DISCORD_ID || "").trim();

    const result = comments.map((c) => {
      let isAdmin = false;
      if (c.provider === "discord" && adminDiscord) {
        isAdmin = String(c.provider_user_id) === adminDiscord;
      } else if (c.provider === "github" && adminGithub) {
        const login = String(c.author_url || "").split("/").pop().toLowerCase();
        isAdmin = String(c.provider_user_id) === adminGithub || login === adminGithub;
      }
      return {
        ...c,
        is_admin: isAdmin,
        // NUMERIC/COUNT come back as strings; normalise to one decimal (3.8, 4.2)
        rating_avg: c.rating_avg === null ? 0 : round1(c.rating_avg),
        rating_count: Number(c.rating_count),
        my_rating: c.my_rating === null ? null : Number(c.my_rating)
      };
    });

    return Response.json({ comments: result });
  } catch (error) {
    console.error("Database query error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};