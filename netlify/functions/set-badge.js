import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

// The ONLY values the column may ever hold. Display text lives in comments.njk.
const ALLOWED_BADGES = ["wonderful", "dishonor"];

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Same rule as delete-comment.js: role comes from the signed token.
  if (session.role !== "moderator" && session.role !== "author") {
    return new Response("Forbidden: Only moderators can grant badges", { status: 403 });
  }

  try {
    const { comment_id, badge } = await req.json();
    if (!comment_id) {
      return new Response("Missing required parameters", { status: 400 });
    }

    // null = remove the badge
    const newBadge = badge === null || badge === undefined ? null : String(badge);
    if (newBadge !== null && !ALLOWED_BADGES.includes(newBadge)) {
      return new Response("Invalid badge", { status: 400 });
    }

    const rows = await sql`
      UPDATE twa_comments
      SET mod_badge = ${newBadge}
      WHERE id = ${comment_id} AND is_deleted = FALSE
      RETURNING id, mod_badge;
    `;
    if (rows.length === 0) {
      return new Response("Comment not found", { status: 404 });
    }

    return Response.json({ success: true, mod_badge: rows[0].mod_badge });
  } catch (error) {
    console.error("Badge update error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
