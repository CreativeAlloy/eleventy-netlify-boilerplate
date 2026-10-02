import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

const round1 = (n) => Math.round(Number(n) * 10) / 10;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { comment_id, rating } = await req.json();
    const value = Number(rating);

    // 0.0 to 5.0 in steps of 0.5
    if (
      !comment_id ||
      rating === null || rating === undefined || rating === "" ||
      !Number.isFinite(value) || value < 0 || value > 5 || !Number.isInteger(value * 2)
    ) {
      return new Response("Invalid rating", { status: 400 });
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

    if (target.is_deleted) {
      return new Response("Cannot rate a deleted comment", { status: 409 });
    }

    const isOwner =
      String(target.provider) === String(session.provider) &&
      String(target.provider_user_id) === String(session.provider_user_id);
    if (isOwner) {
      return new Response("You can't rate your own comment", { status: 403 });
    }

    // One row per (comment, person); re-rating just updates it.
    await sql`
      INSERT INTO twa_comment_ratings (comment_id, provider, provider_user_id, rating)
      VALUES (${comment_id}, ${session.provider}, ${String(session.provider_user_id)}, ${value})
      ON CONFLICT (comment_id, provider, provider_user_id)
      DO UPDATE SET rating = EXCLUDED.rating, updated_at = now();
    `;

    const agg = await sql`
      SELECT AVG(rating) AS rating_avg, COUNT(*) AS rating_count
      FROM twa_comment_ratings
      WHERE comment_id = ${comment_id};
    `;

    return Response.json({
      rating_avg: round1(agg[0].rating_avg),
      rating_count: Number(agg[0].rating_count),
      my_rating: value
    });
  } catch (error) {
    console.error("Rating error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};