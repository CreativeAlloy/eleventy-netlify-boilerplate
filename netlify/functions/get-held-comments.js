import { neon } from "@netlify/neon";
import { requireModerator } from "../lib/moderation/auth.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

const PAGE_SIZE = 100;

export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Only a verified moderator session may see held comments.
  const auth = requireModerator(req);
  if (auth.response) return auth.response;

  try {
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT id, post_slug, parent_id, author_name, provider, provider_user_id,
               author_url, avatar_url, comment_body, created_at, moderation_flags
        FROM twa_comments
        WHERE moderation_status = 'pending_review'
          AND is_deleted IS NOT TRUE
        ORDER BY created_at ASC
        LIMIT ${PAGE_SIZE};
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM twa_comments
        WHERE moderation_status = 'pending_review'
          AND is_deleted IS NOT TRUE;
      `
    ]);

    const comments = rows.map((c) => ({
      ...c,
      id: Number(c.id),
      parent_id: c.parent_id === null ? null : Number(c.parent_id),
      moderation_flags: Array.isArray(c.moderation_flags) ? c.moderation_flags : []
    }));

    return Response.json(
      { total: Number(countRows[0].total), comments },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Held comments query error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};