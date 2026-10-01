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

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, stars)
      VALUES (${slug}, ${session.username}, ${session.provider}, ${session.provider_user_id}, ${cleanBody}, ${cleanStars})
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, stars, created_at, is_deleted, mod_badge;
    `;

    return Response.json({ comment: result[0] });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
