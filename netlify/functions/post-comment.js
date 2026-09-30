import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const data = await req.json();
    const { slug, author_name, provider, provider_user_id, comment_body, stars } = data;

    if (!slug || !comment_body || !comment_body.trim()) {
      return new Response("Invalid comment data", { status: 400 });
    }

    const cleanBody = comment_body.trim();
    const cleanAuthor = author_name || "LocalTester";
    const cleanProvider = provider || "local";
    const cleanUserId = provider_user_id || "guest";
    const cleanStars = Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 5;

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, stars)
      VALUES (${slug}, ${cleanAuthor}, ${cleanProvider}, ${cleanUserId}, ${cleanBody}, ${cleanStars})
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, stars, created_at, is_deleted, mod_badge;
    `;

    return Response.json({ comment: result[0] });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
