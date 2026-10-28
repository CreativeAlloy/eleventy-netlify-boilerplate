import { neon } from "@netlify/neon";
import { requireModerator } from "../lib/moderation/auth.js";
import { REVIEW_ACTIONS, MOD_DELETE_TOMBSTONE } from "../lib/moderation/constants.js";
import { runCommentSideEffects } from "../lib/moderation/side-effects.js";

const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Only a verified moderator session may approve or delete held comments.
  const auth = requireModerator(req);
  if (auth.response) return auth.response;
  const { session } = auth;

  try {
    const body = await req.json();
    const commentId = Number(body.comment_id);
    const action = String(body.action || "");

    if (!Number.isInteger(commentId) || commentId <= 0) {
      return new Response("Invalid comment_id", { status: 400 });
    }
    if (!Object.values(REVIEW_ACTIONS).includes(action)) {
      return new Response("Invalid action", { status: 400 });
    }

    const moderatorProvider = String(session.provider);
    const moderatorId = String(session.provider_user_id);
    const moderatorName = String(session.username || "");

    // Both actions are a single conditional UPDATE: it only matches a comment that is
    // STILL pending, so two moderators clicking at once can't double-process it and a
    // comment that was already handled (or deleted by its author) is never resurrected.
    let rows;
    if (action === REVIEW_ACTIONS.APPROVE) {
      rows = await sql`
        UPDATE twa_comments
        SET moderation_status = 'approved',
            moderated_at = now(),
            moderated_by_provider = ${moderatorProvider},
            moderated_by_user_id = ${moderatorId},
            moderated_by_name = ${moderatorName}
        WHERE id = ${commentId}
          AND moderation_status = 'pending_review'
          AND is_deleted IS NOT TRUE
        RETURNING id, post_slug, parent_id, provider, provider_user_id, comment_body, moderation_status;
      `;
    } else {
      rows = await sql`
        UPDATE twa_comments
        SET moderation_status = 'deleted',
            is_deleted = TRUE,
            comment_body = ${MOD_DELETE_TOMBSTONE},
            mod_badge = NULL,
            moderated_at = now(),
            moderated_by_provider = ${moderatorProvider},
            moderated_by_user_id = ${moderatorId},
            moderated_by_name = ${moderatorName}
        WHERE id = ${commentId}
          AND moderation_status = 'pending_review'
          AND is_deleted IS NOT TRUE
        RETURNING id, post_slug, parent_id, provider, provider_user_id, moderation_status;
      `;
    }

    if (rows.length === 0) {
      const existing = await sql`
        SELECT moderation_status FROM twa_comments WHERE id = ${commentId};
      `;
      if (existing.length === 0) {
        return new Response("Comment not found", { status: 404 });
      }
      return new Response("This comment is no longer awaiting review", { status: 409 });
    }

    const comment = rows[0];

    // The comment just became public: only now do subscribers get notified.
    if (action === REVIEW_ACTIONS.APPROVE) {
      await runCommentSideEffects(sql, {
        commentId: Number(comment.id),
        slug: comment.post_slug,
        parentId: comment.parent_id === null ? null : Number(comment.parent_id),
        body: comment.comment_body,
        provider: comment.provider,
        providerUserId: comment.provider_user_id
      });
    }

    return Response.json({
      success: true,
      comment_id: Number(comment.id),
      status: comment.moderation_status
    });
  } catch (error) {
    console.error("Comment review error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
