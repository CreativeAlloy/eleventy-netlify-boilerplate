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

  const provider = String(session.provider);
  const userId = String(session.provider_user_id);

  try {
    const { notification_id, all } = await req.json();

    // Mark everything this user has unread
    if (all === true) {
      const rows = await sql`
        UPDATE twa_notifications
        SET is_read = TRUE
        WHERE recipient_provider = ${provider}
          AND recipient_user_id = ${userId}
          AND is_read = FALSE
        RETURNING id;
      `;
      return Response.json({ updated: rows.length });
    }

    // Mark one. The recipient check means nobody can touch another user's rows.
    const id = Number(notification_id);
    if (!Number.isInteger(id) || id <= 0) {
      return new Response("Invalid notification_id", { status: 400 });
    }

    const rows = await sql`
      UPDATE twa_notifications
      SET is_read = TRUE
      WHERE id = ${id}
        AND recipient_provider = ${provider}
        AND recipient_user_id = ${userId}
      RETURNING id;
    `;
    if (rows.length === 0) {
      return new Response("Notification not found", { status: 404 });
    }
    return Response.json({ updated: 1 });
  } catch (error) {
    console.error("Mark-read error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
