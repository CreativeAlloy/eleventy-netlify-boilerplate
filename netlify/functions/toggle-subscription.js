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
    const { parent_id } = await req.json();
    const parentId = Number(parent_id);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return new Response("Invalid parent_id", { status: 400 });
    }

    // Subscriptions only ever track a root (top-level) thread.
    const rows = await sql`
      SELECT id, is_deleted, parent_id
      FROM twa_comments
      WHERE id = ${parentId};
    `;
    if (rows.length === 0 || rows[0].is_deleted) {
      return new Response("Comment not found or deleted", { status: 404 });
    }
    if (rows[0].parent_id !== null) {
      return new Response("Only top-level comments can be subscribed to", { status: 400 });
    }

    // Atomic insert-or-toggle: a first click inserts an ACTIVE row; later clicks flip it.
    const [row] = await sql`
      INSERT INTO twa_thread_subscriptions (parent_id, provider, provider_user_id, is_active)
      VALUES (${parentId}, ${session.provider}, ${String(session.provider_user_id)}, TRUE)
      ON CONFLICT (parent_id, provider, provider_user_id)
      DO UPDATE SET is_active = NOT twa_thread_subscriptions.is_active
      RETURNING is_active;
    `;

    return Response.json({ is_subscribed: row.is_active === true });
  } catch (error) {
    console.error("Subscription toggle error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};