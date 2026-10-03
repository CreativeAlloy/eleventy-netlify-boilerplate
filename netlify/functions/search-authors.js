import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";

  try {
    const cleanQuery = q.trim();

    const authors = await sql`
      SELECT author_name, provider, provider_user_id, avatar_url, author_url
      FROM (
        SELECT DISTINCT ON (LOWER(author_name), provider)
          author_name,
          provider,
          provider_user_id,
          avatar_url,
          author_url
        FROM twa_comments
        WHERE author_name ILIKE ${'%' + cleanQuery + '%'}
          AND author_name NOT IN ('Anonymous', 'LocalTester')
          AND is_deleted = FALSE
        ORDER BY
          LOWER(author_name),
          provider,
          NULLIF(avatar_url, '') DESC NULLS LAST
      ) sub
      LIMIT 6;
    `;

    return Response.json(
      { authors },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Search authors error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};