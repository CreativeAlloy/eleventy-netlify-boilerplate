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
    const { slug, comment_body, parent_id } = await req.json();

    if (!slug || !comment_body || !comment_body.trim()) {
      return new Response("Invalid comment data", { status: 400 });
    }

    const cleanBody = comment_body.trim().slice(0, 5000);

    let parentId = null;
    if (parent_id !== null && parent_id !== undefined && parent_id !== "") {
      parentId = Number(parent_id);
      if (!Number.isInteger(parentId) || parentId <= 0) {
        return new Response("Invalid parent_id", { status: 400 });
      }

      // Verify referenced parent comment exists, belongs to same slug, and is not deleted
      const parentRows = await sql`
        SELECT id, is_deleted, parent_id
        FROM twa_comments
        WHERE id = ${parentId} AND post_slug = ${slug};
      `;

      if (parentRows.length === 0 || parentRows[0].is_deleted) {
        return new Response("Parent comment not found or deleted", { status: 404 });
      }

      // Enforce single-depth flat threading (replies cannot have replies)
      if (parentRows[0].parent_id !== null) {
        return new Response("Nested replies are not allowed", { status: 400 });
      }
    }

    // Resolve verified profile URL on the server side
    let authorUrl = null;
    const userHandle = session.handle || session.username;

    if (session.provider === "instagram" && userHandle) {
      authorUrl = `https://instagram.com/${encodeURIComponent(userHandle)}`;
    } else if (session.provider === "discord" && session.provider_user_id) {
      // Discord profile links are keyed by the numeric user ID (handles can change)
      authorUrl = `https://discord.com/users/${encodeURIComponent(session.provider_user_id)}`;
    } else if (session.provider === "github" && session.provider_user_id) {
      try {
        const ghRes = await fetch(`https://api.github.com/user/${encodeURIComponent(session.provider_user_id)}`, {
          headers: {
            "Accept": "application/vnd.github+json",
            "User-Agent": "TheWaspAlloy-App"
          }
        });
        if (ghRes.ok) {
          const ghData = await ghRes.json();
          authorUrl = ghData.html_url || null;
        }
      } catch (err) {
        console.error("Failed to resolve GitHub profile URL:", err);
      }
    }

    const AVATAR_HOSTS = ["cdn.discordapp.com", "avatars.githubusercontent.com"];
    let avatarUrl = null;
    try {
      const u = new URL(session.avatar_url || "");
      if (u.protocol === "https:" && AVATAR_HOSTS.includes(u.hostname)) avatarUrl = u.href;
    } catch {
      avatarUrl = null;
    }

    // Check the timestamp of the user's most recent comment in Neon
    const [lastPost] = await sql`
      SELECT created_at FROM twa_comments
      WHERE provider = ${session.provider} AND provider_user_id = ${String(session.provider_user_id)}
      ORDER BY created_at DESC LIMIT 1;
    `;

    if (lastPost) {
      const elapsedMs = Date.now() - new Date(lastPost.created_at).getTime();
      if (elapsedMs < 30000) {
        const secondsRemaining = Math.max(1, Math.ceil((30000 - elapsedMs) / 1000));
        return new Response(
          `Slow down! Please wait ${secondsRemaining} second${secondsRemaining === 1 ? "" : "s"} before posting again.`,
          {
            status: 429,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Retry-After": String(secondsRemaining)
            }
          }
        );
      }
    }

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, author_url, avatar_url, parent_id)
      VALUES (${slug}, ${session.username}, ${session.provider}, ${session.provider_user_id}, ${cleanBody}, ${authorUrl}, ${avatarUrl}, ${parentId})
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, created_at, is_deleted, mod_badge, author_url, avatar_url, parent_id;
    `;

    const newComment = result[0];
    const posterId = String(session.provider_user_id);

    // Subscriptions + notifications. The comment is already saved at this point, so a
    // failure here (e.g. migration not run yet) is logged but never fails the post.
    try {
      if (parentId === null) {
        // New thread: the author follows their own thread by default.
        await sql`
          INSERT INTO twa_thread_subscriptions (parent_id, provider, provider_user_id, is_active)
          VALUES (${newComment.id}, ${session.provider}, ${posterId}, TRUE)
          ON CONFLICT (parent_id, provider, provider_user_id)
          DO UPDATE SET is_active = TRUE;
        `;
      } else {
        await Promise.all([
          // Replying subscribes (or re-activates) the replier on this thread.
          sql`
            INSERT INTO twa_thread_subscriptions (parent_id, provider, provider_user_id, is_active)
            VALUES (${parentId}, ${session.provider}, ${posterId}, TRUE)
            ON CONFLICT (parent_id, provider, provider_user_id)
            DO UPDATE SET is_active = TRUE;
          `,
          // One notification per ACTIVE subscriber, excluding the person who just replied.
          sql`
            INSERT INTO twa_notifications (recipient_provider, recipient_user_id, post_slug, parent_id, reply_id)
            SELECT s.provider, s.provider_user_id, ${slug}::varchar, ${parentId}::integer, ${newComment.id}::integer
            FROM twa_thread_subscriptions s
            WHERE s.parent_id = ${parentId}::integer
              AND s.is_active = TRUE
              AND NOT (s.provider = ${session.provider} AND s.provider_user_id = ${posterId});
          `
        ]);
      }
    } catch (err) {
      console.error("Subscription/notification error:", err);
    }

    return Response.json({ comment: newComment });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
