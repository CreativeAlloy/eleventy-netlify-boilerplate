import { neon } from "@netlify/neon";

// This automatically and securely connects to the Neon database you just set up.
const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  // Get the article's path from the URL, e.g., "/news/my-first-article/"
  const path = new URL(req.url).searchParams.get("path");

  if (!path) {
    return new Response("Path parameter is required", { status: 400 });
  }

  try {
    // This is a single, powerful SQL command that does everything at once.
    // It tries to insert a new row for the article with a count of 1.
    // If the article path already exists (ON CONFLICT), it instead updates the
    // existing row by adding 1 to the count.
    // Finally, it returns the new, updated count.
    const result = await sql`
      INSERT INTO views (path, count)
      VALUES (${path}, 1)
      ON CONFLICT (path)
      DO UPDATE SET count = views.count + 1
      RETURNING count;
    `;

    // Get the new count from the database response
    const newCount = result[0]?.count || 1;

    // Send the new count back to the browser
    return Response.json({ count: newCount });
  } catch (error) {
    console.error("Database error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};