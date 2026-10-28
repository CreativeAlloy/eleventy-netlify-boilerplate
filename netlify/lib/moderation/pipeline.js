// netlify/lib/moderation/pipeline.js
// The moderation pipeline: an ordered list of evaluators, each of which looks at a comment
// and says "flag it" or "let it through". If ANY evaluator flags, the comment is held.
//
// ---------------------------------------------------------------------------
// ADDING THE FUTURE LLM EVALUATOR
// ---------------------------------------------------------------------------
// 1. Create netlify/lib/moderation/llm-evaluator.js exporting an object shaped like
//    keywordEvaluator below:
//
//      export const llmEvaluator = {
//        name: "llm",
//        failClosed: false,   // false: if the model is down, don't hold every comment
//        timeoutMs: 4000,     // give up quickly; a comment POST must stay fast
//        async evaluate({ text }) {
//          // ...call the model...
//          return { flagged, matches: [{ source: "llm", type: "toxicity", rule: "...", matched: "" }] };
//        }
//      };
//
// 2. Import it here and add it to EVALUATORS.
//
// post-comment.js, review-comment.js and the moderator UI need no changes. The keyword
// evaluator stays in the list permanently: it is the always-on baseline.

import { STATUS } from "./constants.js";
import { evaluateKeywords } from "./keyword-filter.js";

const keywordEvaluator = {
  name: "keyword-filter",
  failClosed: true, // a broken baseline filter must never silently publish
  timeoutMs: 250,
  async evaluate({ text }) {
    return evaluateKeywords(text);
  }
};

// Order only affects the order of the reasons shown to moderators.
const EVALUATORS = [keywordEvaluator];

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ctx: { text, slug, parentId, author: { provider, providerUserId, handle } }
// Returns { flagged, status, reasons }. Never throws.
export async function moderateComment(ctx, evaluators = EVALUATORS) {
  const settled = await Promise.allSettled(
    evaluators.map((evaluator) => {
      const run = Promise.resolve().then(() => evaluator.evaluate(ctx));
      return evaluator.timeoutMs ? withTimeout(run, evaluator.timeoutMs, evaluator.name) : run;
    })
  );

  const reasons = [];
  settled.forEach((outcome, i) => {
    const evaluator = evaluators[i];

    if (outcome.status === "fulfilled") {
      const result = outcome.value || {};
      if (result.flagged) reasons.push(...(Array.isArray(result.matches) ? result.matches : []));
      return;
    }

    console.error(`Moderation evaluator "${evaluator.name}" failed:`, outcome.reason);
    if (evaluator.failClosed !== false) {
      reasons.push({
        source: evaluator.name,
        type: "evaluator_error",
        rule: String(outcome.reason?.message || outcome.reason),
        matched: ""
      });
    }
  });

  const flagged = reasons.length > 0;
  return { flagged, status: flagged ? STATUS.PENDING_REVIEW : STATUS.PUBLISHED, reasons };
}
