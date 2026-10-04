import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

const REASONS = ["Hate Speech", "Incitement of Terrorism", "Spam/Virus", "Other Illegal Content"];

// Same comma-separated parsing as isInList in auth.js / get-comments.js
const parseList = (envString) =>
  String(envString || "").split(",").map((s) => s.trim()).filter(Boolean);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const session = verifySession(req);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const commentId = Number(body.comment_id);
    const reason = String(body.reason || "");

    if (!Number.isInteger(commentId) || commentId <= 0) {
      return new Response("Invalid comment_id", { status: 400 });
    }
    if (!REASONS.includes(reason)) {
      return new Response("Invalid reason", { status: 400 });
    }

    const rows = await sql`
      SELECT id, post_slug, parent_id, provider, provider_user_id, is_deleted
      FROM twa_comments
      WHERE id = ${commentId};
    `;
    if (rows.length === 0) {
      return new Response("Comment not found", { status: 404 });
    }
    const comment = rows[0];

    if (comment.is_deleted) {
      return new Response("Comment already removed", { status: 410 });
    }

    const reporterProvider = String(session.provider);
    const reporterId = String(session.provider_user_id);

    if (String(comment.provider) === reporterProvider && String(comment.provider_user_id) === reporterId) {
      return new Response("You can't report your own comment", { status: 400 });
    }

    // Duplicate (same user, same comment) is silently ignored thanks to the UNIQUE constraint
    const inserted = await sql`
      INSERT INTO twa_reports (comment_id, reporter_provider, reporter_user_id, reporter_name, reason)
      VALUES (${commentId}, ${reporterProvider}, ${reporterId}, ${session.username}, ${reason})
      ON CONFLICT (comment_id, reporter_provider, reporter_user_id) DO NOTHING
      RETURNING id;
    `;
    if (inserted.length === 0) {
      return Response.json({ success: true, duplicate: true });
    }

    // The report is saved at this point; a notification failure is logged but never fails the request.
    try {
      const rootId = comment.parent_id === null ? comment.id : comment.parent_id;

      const discordAdmins = parseList(process.env.ADMIN_DISCORD_IDS || process.env.ADMIN_DISCORD_ID);
      const githubEntries = parseList(process.env.ADMIN_GITHUB_IDS || process.env.ADMIN_GITHUB_ID);

      // GitHub admins may be listed by numeric ID or by login (auth.js accepts both),
      // but notifications are addressed by numeric ID. Resolve logins via known commenters.
      const githubNumeric = githubEntries.filter((e) => /^\d+$/.test(e));
      const githubLogins = githubEntries.filter((e) => !/^\d+$/.test(e)).map((e) => e.toLowerCase());
      let githubResolved = [];
      if (githubLogins.length > 0) {
        const found = await sql`
          SELECT DISTINCT provider_user_id
          FROM twa_comments
          WHERE provider = 'github'
            AND lower(split_part(author_url, '/', 4)) = ANY(${githubLogins}::text[]);
        `;
        githubResolved = found.map((r) => String(r.provider_user_id));
      }

      // Dedupe, and don't notify the reporter about their own report
      const recipients = new Map();
      for (const id of discordAdmins) recipients.set(`discord:${id}`, ["discord", id]);
      for (const id of [...githubNumeric, ...githubResolved]) recipients.set(`github:${id}`, ["github", id]);
      recipients.delete(`${reporterProvider}:${reporterId}`);

      if (recipients.size > 0) {
        const providers = [...recipients.values()].map((r) => r[0]);
        const userIds = [...recipients.values()].map((r) => r[1]);

        await sql`
          INSERT INTO twa_notifications
            (recipient_provider, recipient_user_id, post_slug, parent_id, reply_id, kind, report_reason, reporter_name)
          SELECT r.provider, r.uid, ${comment.post_slug}::varchar, ${rootId}::integer, ${commentId}::integer,
                 'report', ${reason}, ${session.username}
          FROM unnest(${providers}::text[], ${userIds}::text[]) AS r(provider, uid);
        `;
      }
    } catch (err) {
      console.error("Report notification error:", err);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Report error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
