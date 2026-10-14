// Validates every entry in content/entries/ and rebuilds content/index.json.
// The index carries what the list views and the term linker need; the detail view fetches the entry file.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const expectId = f.replace(/\.json$/, "");
  if (e.id !== expectId) say(`id "${e.id}" does not match the file name`);
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(e.id ?? "")) say(`id must be YYYY-MM-DD-slug (ascii kebab-case)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "")) say(`bad date "${e.date}"`);
  if (!e.id?.startsWith(e.date + "-")) say(`id must start with the date`);
  if (!Array.isArray(e.subjects) || e.subjects.length < 1 || e.subjects.length > 2) say(`subjects must have 1 or 2 ids`);
  for (const s of e.subjects ?? []) if (!subjects[s]) say(`unknown subject "${s}"`);
  if (![1, 2, 3].includes(e.level)) say(`level must be 1, 2 or 3 (got ${JSON.stringify(e.level)})`);
  for (const lang of ["en", "es"]) {
    if (!Array.isArray(e.aliases?.[lang])) say(`aliases.${lang} must be an array (can be empty)`);
    if (typeof e.imageAlt?.[lang] !== "string" || !e.imageAlt[lang]) say(`imageAlt.${lang} missing`);
    const c = e[lang];
    if (!c) { say(`${lang} missing`); continue; }
    if (!c.title) say(`${lang}.title missing`);
    if (!c.tagline) say(`${lang}.tagline missing`);
    else if (c.tagline.length > 110) say(`${lang}.tagline is ${c.tagline.length} chars, keep it under 90`);
    if (!Array.isArray(c.explanation) || c.explanation.length < 2 || c.explanation.length > 4) say(`${lang}.explanation needs 2 to 4 paragraphs`);
    if (!c.analogy) say(`${lang}.analogy missing`);
    if (!Array.isArray(c.keyPoints) || c.keyPoints.length < 3 || c.keyPoints.length > 4) say(`${lang}.keyPoints needs 3 or 4 items`);
    if (!Array.isArray(c.links) || c.links.length < 1 || c.links.length > 3) say(`${lang}.links needs 1 to 3 items`);
    for (const l of c.links ?? []) {
      if (!l.label || !/^https:\/\/\S+$/.test(l.url ?? "")) say(`${lang}: bad link ${JSON.stringify(l)}`);
    }
    for (const txt of [...(c.explanation ?? []), c.analogy ?? "", ...(c.keyPoints ?? [])]) {
      if (/<[a-z/]/i.test(txt)) say(`${lang}: HTML is not allowed in text ("${txt.slice(0, 40)}…")`);
    }
    const key = `${lang}:${(c.title ?? "").toLowerCase()}`;
    if (seenTitles.has(key)) say(`${lang}.title "${c.title}" is already used by ${seenTitles.get(key)}`);
    else seenTitles.set(key, f);
  }

  // The illustration: must exist, be an SVG with our viewBox, and contain nothing active.
  if (e.image !== `img/${e.id}.svg`) say(`image must be "img/${e.id}.svg"`);
  const imgPath = path.join(root, "content", e.image ?? "");
  try {
    await stat(imgPath);
    const svg = await readFile(imgPath, "utf8");
    if (!/^\s*<svg[\s>]/i.test(svg)) say(`image does not start with <svg`);
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) say(`image needs the svg xmlns`);
    if (!/viewBox="0 0 400 240"/.test(svg)) say(`image needs viewBox="0 0 400 240"`);
    if (/<\s*(script|image|foreignObject|iframe|style|link|a)\b/i.test(svg)) say(`image contains a forbidden element`);
    if (/\bon[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg) || /href\s*=\s*"(?!#)/i.test(svg) || /url\(/i.test(svg)) say(`image contains an active attribute`);
    if (svg.length > 8000) say(`image is ${svg.length} chars, keep it under 6000`);
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
