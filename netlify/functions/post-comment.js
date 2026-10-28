import { neon } from "@netlify/neon";
import { verifySession } from "../lib/session.js";
import { moderateComment } from "../lib/moderation/pipeline.js";
import { STATUS, HELD_NOTICE } from "../lib/moderation/constants.js";
import { runCommentSideEffects } from "../lib/moderation/side-effects.js";

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
        WHERE id = ${parentId} AND post_slug = ${slug}
          AND moderation_status IN ('published', 'approved');
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

    // Moderation pipeline (keyword filter today; an LLM evaluator can be added in pipeline.js
    // later). Fail closed: if the pipeline itself blows up, hold the comment, never publish it.
    let verdict;
    try {
      verdict = await moderateComment({
        text: cleanBody,
        slug,
        parentId,
        author: {
          provider: session.provider,
          providerUserId: String(session.provider_user_id),
          handle: session.handle || session.username
        }
      });
    } catch (err) {
      console.error("Moderation pipeline error:", err);
      verdict = {
        flagged: true,
        status: STATUS.PENDING_REVIEW,
        reasons: [{ source: "pipeline", type: "pipeline_error", rule: String(err?.message || err), matched: "" }]
      };
    }
    const flagsJson = verdict.flagged ? JSON.stringify(verdict.reasons) : null;

    const result = await sql`
      INSERT INTO twa_comments (post_slug, author_name, provider, provider_user_id, comment_body, author_url, avatar_url, parent_id, moderation_status, moderation_flags)
      VALUES (${slug}, ${session.username}, ${session.provider}, ${session.provider_user_id}, ${cleanBody}, ${authorUrl}, ${avatarUrl}, ${parentId}, ${verdict.status}, ${flagsJson}::jsonb)
      RETURNING id, post_slug, author_name, provider, provider_user_id, comment_body, created_at, is_deleted, mod_badge, author_url, avatar_url, parent_id, moderation_status;
    `;

    const newComment = result[0];

    // Held comments stay invisible: no subscriptions and no notifications are created
    // until a moderator approves them (see review-comment.js).
    if (verdict.flagged) {
      return Response.json(
        { held: true, status: verdict.status, message: HELD_NOTICE, comment: newComment },
        { status: 202 }
      );
    }

    // Clean comment: standard publication workflow. Failures inside are logged, never thrown.
    await runCommentSideEffects(sql, {
      commentId: newComment.id,
      slug,
      parentId,
      body: cleanBody,
      provider: session.provider,
      providerUserId: session.provider_user_id
    });

    return Response.json({ comment: newComment });
  } catch (error) {
    console.error("Database insertion error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
