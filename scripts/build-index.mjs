// Validates every entry in content/entries/ (the rules are in entry-rules.mjs) and rebuilds content/index.json.
// The index carries what the list views and the term linker need; the detail view fetches the entry file.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEntry, validateSvg } from "./entry-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entriesDir = path.join(root, "content", "entries");
const subjects = JSON.parse(await readFile(path.join(root, "content", "subjects.json"), "utf8"));

const files = (await readdir(entriesDir)).filter((f) => f.endsWith(".json")).sort();
const entries = [];
const problems = [];
const seenTitles = new Map();

for (const f of files) {
  const say = (m) => problems.push(`${f}: ${m}`);
  let e;
  try { e = JSON.parse(await readFile(path.join(entriesDir, f), "utf8")); } catch (err) { say(`invalid JSON (${err.message})`); continue; }

  if (e.id !== f.replace(/\.json$/, "")) say(`id "${e.id}" does not match the file name`);
  for (const p of validateEntry(e, { subjects })) say(p);
  if (e?.en && e?.es) for (const lang of ["en", "es"]) {
    const key = `${lang}:${(e[lang].title ?? "").toLowerCase()}`;
    if (seenTitles.has(key)) say(`${lang}.title "${e[lang].title}" is already used by ${seenTitles.get(key)}`);
    else seenTitles.set(key, f);
  }

  // The illustration: must exist, be an SVG with our viewBox, and contain nothing active.
  try {
    const svg = await readFile(path.join(root, "content", e.image ?? ""), "utf8");
    for (const p of validateSvg(svg)) say(p);
  } catch { say(`image file ${e.image} not found`); }

  if (problems.some((p) => p.startsWith(f + ":"))) continue;
  entries.push({
    id: e.id,
    date: e.date,
    subjects: e.subjects,
    level: e.level,
    image: e.image,
    imageAlt: e.imageAlt,
    title: { en: e.en.title, es: e.es.title },
    tagline: { en: e.en.tagline, es: e.es.tagline },
    aliases: { en: e.aliases.en, es: e.aliases.es },
    ...(e.caseSensitive ? { caseSensitive: true } : {}),
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in ${new Set(problems.map((p) => p.split(":")[0])).size} file(s).`);
  process.exit(1);
}

// Newest first; within a day, by level and then title, so a batch reads in a sensible order.
entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.level !== b.level ? a.level - b.level : a.title.en.localeCompare(b.title.en)));
const out = { count: entries.length, entries };
await writeFile(path.join(root, "content", "index.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`index.json: ${entries.length} entries`);
