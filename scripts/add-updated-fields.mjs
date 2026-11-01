// Adds empty `updated:` and `updatedauthor:` keys after `author:` in every posts/*.md.
// Dry run by default. Pass --write to modify files.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "posts";
const write = process.argv.includes("--write");
let changed = 0;

for (const name of readdirSync(dir).filter(f => f.endsWith(".md"))) {
  const path = join(dir, name);
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) { console.log(`skip (no front matter): ${name}`); continue; }

  const fm = m[1];
  if (/^updated:/m.test(fm)) { console.log(`skip (already has updated): ${name}`); continue; }
  if (!/^author:[^\r\n]*$/m.test(fm)) { console.log(`skip (no author line): ${name}`); continue; }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const newFm = fm.replace(/^(author:[^\r\n]*)$/m, `$1${eol}updated:${eol}updatedauthor:`);
  const start = m[0].indexOf(fm);
  const out = text.slice(0, start) + newFm + text.slice(start + fm.length);

  console.log(`${write ? "updated" : "would update"}: ${name}`);
  if (write) writeFileSync(path, out);
  changed++;
}
console.log(`\n${changed} file(s) ${write ? "modified" : "would be modified (re-run with --write)"}.`);
