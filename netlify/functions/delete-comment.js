import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { comment_id } = await req.json();
    if (!comment_id) {
      return new Response("Missing required parameters", { status: 400 });
    }

    const rows = await sql`
      SELECT id, provider, provider_user_id, is_deleted
      FROM twa_comments
      WHERE id = ${comment_id};
    `;
    if (rows.length === 0) {
      return new Response("Comment not found", { status: 404 });
    }
    const target = rows[0];

    // Role was assigned server-side in auth.js and is covered by the signature.
    const isModerator = session.role === "moderator"; // Only Admins can delete any comment!
    const isOwner =
      String(target.provider) === String(session.provider) &&
      String(target.provider_user_id) === String(session.provider_user_id);

    if (!isModerator && !isOwner) {
      return new Response("Forbidden: You do not have permission to delete this comment", { status: 403 });
    }

    // Owners deleting their own comment get the neutral text, even if they're a mod.
    const tombstoneText = isOwner
      ? "[Comment deleted by author.]"
      : "[Comment removed by Moderator: Violation of site ethics.]";

    await sql`
      UPDATE twa_comments
      SET comment_body = ${tombstoneText},
          is_deleted = TRUE,
          mod_badge = NULL
      WHERE id = ${comment_id};
    `;

    return Response.json({ success: true, message: tombstoneText });
  } catch (error) {
    console.error("Database deletion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
