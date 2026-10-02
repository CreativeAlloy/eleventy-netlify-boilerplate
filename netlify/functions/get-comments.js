import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const slug = params.get("slug");

  if (!slug) {
    return new Response("Missing slug parameter", { status: 400 });
  }

  try {
    const comments = await sql`
      SELECT id, post_slug, author_name, provider, provider_user_id, comment_body, stars, created_at, is_deleted, mod_badge, author_url, avatar_url
      FROM twa_comments
      WHERE post_slug = ${slug}
      ORDER BY created_at DESC;
    `;

    return Response.json({ comments });
  } catch (error) {
    console.error("Database query error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};