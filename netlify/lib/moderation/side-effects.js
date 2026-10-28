// netlify/lib/moderation/side-effects.js
// Thread subscriptions + notifications for a comment that has just become PUBLIC.
//
// Clean comments run this straight from post-comment.js. Held comments run it from
// review-comment.js when a moderator approves them, so nobody is ever notified about
// (or shown a snippet of) a comment that is still hidden.
//
// Failures are logged and swallowed: the comment is already saved, so a problem here must
// never fail the request.

export async function runCommentSideEffects(sql, { commentId, slug, parentId, body, provider, providerUserId }) {
  const posterId = String(providerUserId);

  // Extract mentions from comment body using regex [@Name]
  const mentionsMatch = Array.from(String(body).matchAll(/\[@([^\]]+)\]/g)).map((m) => m[1]);
  const mentions = [...new Set(mentionsMatch)];
  // Fallback array to avoid PostgreSQL syntax errors if mentions array is empty
  const safeMentions = mentions.length > 0 ? mentions : ["__NO_MATCH__"];

  try {
    if (parentId === null) {
      // New thread: the author follows their own thread by default.
      const rootPromises = [
        sql`
          INSERT INTO twa_thread_subscriptions (parent_id, provider, provider_user_id, is_active)
          VALUES (${commentId}, ${provider}, ${posterId}, TRUE)
          ON CONFLICT (parent_id, provider, provider_user_id)
          DO UPDATE SET is_active = TRUE;
        `
      ];

      // Global check: notify tagged users even on a root comment
      if (mentions.length > 0) {
        rootPromises.push(
          sql`
            INSERT INTO twa_notifications (recipient_provider, recipient_user_id, post_slug, parent_id, reply_id)
            SELECT DISTINCT provider, provider_user_id, ${slug}::varchar, ${commentId}::integer, ${commentId}::integer
            FROM twa_comments
            WHERE author_name ILIKE ANY(${safeMentions}::text[])
              AND NOT (provider = ${provider} AND provider_user_id = ${posterId});
          `
        );
      }
      await Promise.all(rootPromises);
    } else {
      await Promise.all([
        // Replying subscribes (or re-activates) the replier on this thread.
        sql`
          INSERT INTO twa_thread_subscriptions (parent_id, provider, provider_user_id, is_active)
          VALUES (${parentId}, ${provider}, ${posterId}, TRUE)
          ON CONFLICT (parent_id, provider, provider_user_id)
          DO UPDATE SET is_active = TRUE;
        `,
        // Deduplicated notifications: thread subscribers + directly tagged global users via UNION
        sql`
          INSERT INTO twa_notifications (recipient_provider, recipient_user_id, post_slug, parent_id, reply_id)
          SELECT provider, provider_user_id, ${slug}::varchar, ${parentId}::integer, ${commentId}::integer
          FROM (
            SELECT provider, provider_user_id
            FROM twa_thread_subscriptions
            WHERE parent_id = ${parentId}::integer
              AND is_active = TRUE
            UNION
            SELECT provider, provider_user_id
            FROM twa_comments
            WHERE author_name ILIKE ANY(${safeMentions}::text[])
          ) AS combined_recipients
          WHERE NOT (provider = ${provider} AND provider_user_id = ${posterId});
        `
      ]);
    }
  } catch (err) {
    console.error("Subscription/notification error:", err);
  }
}
