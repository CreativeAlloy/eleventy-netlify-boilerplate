// netlify/lib/moderation/keyword-filter.js
// Deterministic keyword / regex filter driven by /_data/comment-filter.json.
//
// esbuild inlines the JSON at deploy time, so there is no file I/O at request time and the
// rules are compiled exactly once per function cold start.
import filterConfig from "../../../_data/comment-filter.json";

// Soft hyphen, zero-width spaces/joiners, bidi marks and embeds, word joiner, BOM.
// Stripped so "f\u200Bree nitro" cannot slip past "free nitro".
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

const MAX_REPORTED_MATCHES = 20;
const MAX_EXCERPT_LENGTH = 80;

// Unicode-aware "word edge": not preceded/followed by a letter, number or underscore.
const WORD_START = "(?<![\\p{L}\\p{N}_])";
const WORD_END = "(?![\\p{L}\\p{N}_])";

export function normalizeText(text) {
  return String(text ?? "").normalize("NFKC").replace(INVISIBLE, "");
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Literal text -> regex source. Any run of whitespace in a phrase matches any run of whitespace.
const literalSource = (text) => escapeRegExp(text.trim()).replace(/\s+/g, "\\s+");

function asStringList(value, key) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    console.error(`comment-filter.json: "${key}" must be an array; ignoring it.`);
    return [];
  }
  return value.filter((item) => {
    const ok = typeof item === "string" && item.trim() !== "";
    if (!ok) console.error(`comment-filter.json: ignoring invalid entry in "${key}":`, item);
    return ok;
  });
}

function compile(type, rule, source) {
  try {
    const regex = new RegExp(source, "iu");
    // A rule that matches the empty string would flag every comment. Refuse it.
    if (regex.test("")) {
      console.error(`comment-filter.json: ${type} rule matches empty text; ignoring it:`, rule);
      return null;
    }
    return { type, rule, regex };
  } catch (err) {
    console.error(`comment-filter.json: invalid ${type} rule ignored:`, rule, err.message);
    return null;
  }
}

export function compileRules(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const rules = [];

  for (const word of asStringList(cfg.words, "words")) {
    rules.push(compile("word", word, `${WORD_START}${literalSource(word)}${WORD_END}`));
  }
  for (const term of asStringList(cfg.terms, "terms")) {
    rules.push(compile("term", term, literalSource(term)));
  }
  for (const pattern of asStringList(cfg.patterns, "patterns")) {
    rules.push(compile("pattern", pattern, pattern));
  }
  return rules.filter(Boolean);
}

// Factory so tests (or a future per-site override) can build a filter from any config.
export function createKeywordFilter(config) {
  const rules = compileRules(config);

  // Returns { flagged, matches: [{ source, type, rule, matched }] }
  return function evaluateKeywords(text) {
    const haystack = normalizeText(text);
    const matches = [];

    for (const { type, rule, regex } of rules) {
      const hit = regex.exec(haystack);
      if (!hit) continue;
      matches.push({
        source: "keyword-filter",
        type,
        rule,
        matched: hit[0].slice(0, MAX_EXCERPT_LENGTH)
      });
      if (matches.length >= MAX_REPORTED_MATCHES) break;
    }

    return { flagged: matches.length > 0, matches };
  };
}

export const evaluateKeywords = createKeywordFilter(filterConfig);