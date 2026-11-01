// Adds / fills `minuteread:` in the front matter of every posts/*.md.
//
//   node scripts/minute-read.mjs                 preview (dry run)
//   node scripts/minute-read.mjs --write         apply
//   node scripts/minute-read.mjs --write --force also overwrite values that already exist
//   node scripts/minute-read.mjs --wpm=230       change reading speed (default 200)
//
// Existing non-empty values are never touched unless --force, so values you wrote
// by hand are safe. Code blocks, {% shortcodes %}, twatable CSV, HTML tags, link
// URLs and &term&(definition) popovers are excluded from the word count.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "posts";
const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const wpm = Number((process.argv.find(a => a.startsWith("--wpm=")) || "").split("=")[1]) || 200;

function proseOnly(body) {
  return body
    .replace(/```[\s\S]*?```/g, " ")                                  // fenced code
    .replace(/\{%\s*twatable\s*%\}[\s\S]*?\{%\s*endtwatable\s*%\}/g, " ") // CSV tables
    .replace(/\{%[\s\S]*?%\}/g, " ")                                  // other shortcodes (citations...)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")                // inline scripts/styles
    .replace(/<[^>]+>/g, " ")                                         // HTML tags
    .replace(/!(?:audio|video)(?:\[[^\]]*\])?\([^)]*\)/g, " ")        // !audio / !video players
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")                            // images
    .replace(/&([^&]+)&\([^)]*\)/g, "$1")                             // &term&(definition) -> term
    .replace(/\]\([^)]*\)/g, "] ")                                    // link targets
    .replace(/https?:\/\/\S+/g, " ");                                 // bare URLs
}

const countWords = text =>
  (text.match(/[\p{L}\p{N}]+(?:['’′-][\p{L}\p{N}]+)*/gu) || []).length;

let changed = 0;
for (const name of readdirSync(dir).filter(f => f.endsWith(".md"))) {
  const path = join(dir, name);
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) { console.log(`skip (no front matter): ${name}`); continue; }

  const fm = m[1];
  const existing = fm.match(/^minuteread:[ \t]*([^\r\n]*)$/m);
  if (existing && existing[1].trim() !== "" && !force) {
    console.log(`skip (already ${existing[1].trim()}): ${name}`);
    continue;
  }

  const words = countWords(proseOnly(text.slice(m[0].length)));
  const minutes = Math.max(1, Math.round(words / wpm));
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let newFm;

  if (existing) {
    newFm = fm.replace(/^minuteread:[^\r\n]*$/m, `minuteread: ${minutes}`);
  } else if (/^author:[^\r\n]*$/m.test(fm)) {
    newFm = fm.replace(/^(author:[^\r\n]*)$/m, `$1${eol}minuteread: ${minutes}`);
  } else if (/^date:[^\r\n]*$/m.test(fm)) {
    newFm = fm.replace(/^(date:[^\r\n]*)$/m, `$1${eol}minuteread: ${minutes}`);
  } else {
    console.log(`skip (no author/date line): ${name}`);
    continue;
  }

  const start = m[0].indexOf(fm);
  const out = text.slice(0, start) + newFm + text.slice(start + fm.length);
  console.log(`${write ? "wrote" : "would write"}: ${name}  ${words.toLocaleString()} words -> ${minutes} min`);
  if (write) writeFileSync(path, out);
  changed++;
}
console.log(`\n${changed} file(s) ${write ? "modified" : "would change (re-run with --write)"}.`);
