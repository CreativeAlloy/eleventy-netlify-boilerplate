import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const path = params.get("path");
  const action = params.get("action"); // New parameter: 'increment' or 'get'

  if (!path) {
    return new Response("Path parameter is required", { status: 400 });
  }

  try {
    let count;

    if (action === "increment") {
      // If the action is 'increment', run the powerful SQL command to update and return the count.
      const result = await sql`
        INSERT INTO views (path, count)
        VALUES (${path}, 1)
        ON CONFLICT (path)
        DO UPDATE SET count = views.count + 1
        RETURNING count;
      `;
      count = result[0]?.count || 1;
    } else {
      // If the action is just 'get', run a simple SELECT query.
      const result = await sql`
        SELECT count FROM views WHERE path = ${path};
      `;
      // If the article has no views yet, return 0.
      count = result[0]?.count || 0;
    }

    return Response.json({ count: count });
  } catch (error) {
    console.error("Database error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};