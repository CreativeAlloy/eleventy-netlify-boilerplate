import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const provider = String(session.provider);
  const userId = String(session.provider_user_id);

  try {
    // Replier details are pulled live from twa_comments, so a replier's current
    // name/avatar is always shown. Deleted replies are hidden from the drawer.
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT n.id, n.post_slug, n.parent_id, n.reply_id, n.is_read, n.created_at,
               n.kind, n.report_reason, n.reporter_name,
               r.author_name, r.provider, r.provider_user_id, r.avatar_url, r.author_url,
               LEFT(r.comment_body, 400) AS comment_body
        FROM twa_notifications n
        JOIN twa_comments r ON r.id = n.reply_id
        WHERE n.recipient_provider = ${provider}
          AND n.recipient_user_id = ${userId}
          AND r.is_deleted IS NOT TRUE
        ORDER BY n.created_at DESC
        LIMIT 50;
      `,
      sql`
        SELECT COUNT(*)::int AS unread_count
        FROM twa_notifications n
        JOIN twa_comments r ON r.id = n.reply_id
        WHERE n.recipient_provider = ${provider}
          AND n.recipient_user_id = ${userId}
          AND n.is_read = FALSE
          AND r.is_deleted IS NOT TRUE;
      `
    ]);

    const notifications = rows.map((n) => ({
      ...n,
      id: Number(n.id),
      parent_id: Number(n.parent_id),
      reply_id: Number(n.reply_id),
      is_read: n.is_read === true
    }));

    return Response.json(
      { unread_count: Number(countRows[0].unread_count), notifications },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Notifications query error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};