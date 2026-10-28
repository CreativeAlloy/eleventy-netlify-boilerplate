// netlify/lib/moderation/constants.js
// Single source of truth for comment moderation states. Lives OUTSIDE netlify/functions
// so Netlify doesn't deploy it as an endpoint; esbuild bundles it into each function.
//
// Lifecycle:
//   published       clean comment, public immediately (the column default)
//   pending_review  held by the filter, hidden from every public surface
//   approved        held comment released by a moderator, public
//   deleted         held comment permanently removed by a moderator, never public
//
// NOTE: SQL in the functions hardcodes ('published', 'approved') for the public check.
// If PUBLIC_STATUSES ever changes, search the functions for that literal and update it too.

export const STATUS = Object.freeze({
  PUBLISHED: "published",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  DELETED: "deleted"
});

export const PUBLIC_STATUSES = Object.freeze([STATUS.PUBLISHED, STATUS.APPROVED]);

export const REVIEW_ACTIONS = Object.freeze({
  APPROVE: "approve",
  DELETE: "delete"
});

// Same wording delete-comment.js uses when a moderator removes a comment.
export const MOD_DELETE_TOMBSTONE = "[Comment removed by Moderator: Violation of site ethics.]";

export const HELD_NOTICE =
  "Your comment has been submitted and is awaiting moderator review. It will appear once approved.";