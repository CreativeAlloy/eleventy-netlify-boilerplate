import { neon } from "@netlify/neon";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const data = await req.json();
    const { comment_id, provider, provider_user_id, username } = data;

    if (!comment_id || !provider || !provider_user_id) {
      return new Response("Missing required parameters", { status: 400 });
    }

    // 1. Fetch the existing comment to verify ownership
    const rows = await sql`
      SELECT id, provider, provider_user_id, is_deleted
      FROM twa_comments
      WHERE id = ${comment_id};
    `;

    if (rows.length === 0) {
      return new Response("Comment not found", { status: 404 });
    }

    const target = rows[0];

    // 2. Check Permissions: Is this the Moderator OR the site Author?
    const ADMIN_ID = process.env.ADMIN_GITHUB_ID;
    const AUTHOR_IG = process.env.AUTHOR_INSTAGRAM_HANDLE;
    const userHandle = data.handle || username;

    const isGithubMod = ADMIN_ID && provider === "github" && (
      String(userHandle).toLowerCase() === String(ADMIN_ID).toLowerCase() ||
      String(provider_user_id) === String(ADMIN_ID)
    );
    const isInstagramAuthor = AUTHOR_IG && provider === "instagram" &&
      String(userHandle).toLowerCase() === AUTHOR_IG.toLowerCase();

    const isModerator = isGithubMod || isInstagramAuthor;

    const isAuthor = (
      String(target.provider) === String(provider) &&
      String(target.provider_user_id) === String(provider_user_id)
    );

    if (!isModerator && !isAuthor) {
      return new Response("Forbidden: You do not have permission to delete this comment", { status: 403 });
    }

    // 3. Choose the appropriate tombstone text
    const tombstoneText = isModerator
      ? "[Comment removed by Moderator: Violation of site ethics.]"
      : "[Comment deleted by author.]";

    // 4. Overwrite comment_body and set is_deleted = TRUE
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