// netlify/lib/moderation/auth.js
// Moderator gate for the review endpoints. "Moderator" and "administrator" are the same role
// on this site; auth.js assigns role = "moderator" server-side from the ADMIN_* env lists and
// the role is covered by the HMAC signature, so it can't be forged from the client.
//
// Deliberately stricter than set-badge.js: the "author" role does NOT grant review rights.
import { verifySession } from "../session.js";

// Returns { session } on success, or { response } (a ready-to-return 401/403) on failure.
export function requireModerator(req) {
  const session = verifySession(req);
  if (!session) {
    return { response: new Response("Unauthorized", { status: 401 }) };
  }
  if (session.role !== "moderator") {
    return { response: new Response("Forbidden: Moderator access required", { status: 403 }) };
  }
  return { session };
}
