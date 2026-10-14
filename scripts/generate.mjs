// Generates one entry (both languages + an SVG illustration) with Claude and writes it
// to content/entries/<date>-<slug>.json and content/img/<date>-<slug>.svg.
//
//   node scripts/generate.mjs                      # today (Argentina time), least-covered subject
//   node scripts/generate.mjs --subject aws        # force a subject
//   node scripts/generate.mjs --topic "DNS"        # force a concept
//   node scripts/generate.mjs --date 2026-11-02    # write for another day
//   node scripts/generate.mjs --dry                # print the prompt, call nothing
//
// Idempotent: if an entry for that date already exists it exits 0 without calling the API.
// Credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const MODEL = process.env.TIDBIT_MODEL ?? "claude-opus-5-5";

const subjects = JSON.parse(await readFile(path.join(root, "content", "subjects.json"), "utf8"));
const subjectIds = Object.keys(subjects);
const date = args.date ?? todayInArgentina();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date must be YYYY-MM-DD, got "${date}"`);

// ---- what already exists -------------------------------------------------
const entriesDir = path.join(root, "content", "entries");
const existingFiles = (await readdir(entriesDir)).filter((f) => f.endsWith(".json"));
if (!args.dry && existingFiles.some((f) => f.startsWith(date + "-"))) {
  console.log(`An entry for ${date} already exists. Nothing to do.`);
  process.exit(0);
}
const existing = await Promise.all(existingFiles.map(async (f) => JSON.parse(await readFile(path.join(entriesDir, f), "utf8"))));
const coverage = Object.fromEntries(subjectIds.map((s) => [s, 0]));
for (const e of existing) for (const s of e.subjects) coverage[s] = (coverage[s] ?? 0) + 1;

// ---- pick the subject: least covered, ties broken at random -----------------
let subject = args.subject;
if (subject && !subjects[subject]) fail(`Unknown subject "${subject}". Known: ${subjectIds.join(", ")}`);
if (!subject) {
  const min = Math.min(...Object.values(coverage));
  const pool = subjectIds.filter((s) => coverage[s] === min);
  subject = pool[Math.floor(Math.random() * pool.length)];
}
const taken = existing.map((e) => `${e.en.title} / ${e.es.title}`).sort();

// ---- the shape we want back -------------------------------------------------
const Lang = z.object({
  title: z.string().describe("The concept's name, 1 to 4 words. Keep well-known acronyms as is (GPU, API, S3)."),
  tagline: z.string().describe("One sentence, under 90 characters, that says what it is in plain words."),
  explanation: z.array(z.string()).min(2).max(4).describe("2 to 4 short paragraphs. Plain language, concrete, no hype. **bold** the term the first time, `code` for identifiers. No headings, no lists inside."),
  analogy: z.string().describe("An everyday analogy in 1 to 3 sentences."),
  keyPoints: z.array(z.string()).min(3).max(4).describe("3 or 4 one-line facts worth remembering."),
  links: z.array(z.object({ label: z.string(), url: z.string() })).min(2).max(3).describe("2 or 3 real, stable, well-known URLs: official docs, Wikipedia, a canonical explainer. Never invent a URL."),
});
const Entry = z.object({
  slug: z.string().describe("kebab-case, ascii, 2 to 40 chars, e.g. 'amazon-s3' or 'neural-network'."),
  subjects: z.array(z.enum(subjectIds)).min(1).max(2).describe(`The main subject first (it must be "${subject}"), optionally one more.`),
  level: z.number().int().min(1).max(3).describe("1 basic (readable cold), 2 intermediate (assumes the basics of its subject), 3 advanced."),
  aliases: z.object({ en: z.array(z.string()), es: z.array(z.string()) }).describe("Other spellings of the term in running text, per language: plurals, acronyms, short names. Not the title itself. Can be empty."),
  imageAlt: z.object({ en: z.string(), es: z.string() }).describe("What the picture shows, one short sentence per language."),
  svg: z.string().describe("The illustration as a complete SVG document. See the rules in the system prompt."),
  en: Lang,
  es: Lang,
});

const system = `You write "Tidbit", a public open-source glossary that explains technology concepts to curious people who are not experts: a nurse, a lawyer, a student, a founder. They hear words like GPU, token, S3, HTTPS, Kubernetes in the news and want to actually understand them in five minutes.

Voice: clear, warm, concrete, never condescending, never hype. Short sentences. Say what the thing IS, what it is FOR, and why it matters now. Prefer a real example over an abstraction. No marketing claims, no superlatives you cannot back up, no made-up numbers; if a number is approximate say "roughly".

Languages: write the English and the Spanish as native pieces with the same content, not a literal translation. Spanish is rioplatense and uses voseo ("podés", "pensá"), neutral enough for any Spanish speaker.

Subjects and what they cover:
${subjectIds.map((s) => `- ${s} (${subjects[s].en} / ${subjects[s].es}): ${subjects[s].hint}`).join("\n")}

Illustration rules (the "svg" field):
- A complete, self-contained <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"> with its own background: <rect width="400" height="240" rx="16" fill="#f3efe6"/> as the first element, so it looks the same in light and dark mode.
- A simple didactic diagram of the concept using basic shapes (rect, circle, line, path, text). Think of a whiteboard sketch, not clip art.
- Palette only: background #f3efe6, ink #2b2b2b, muted text #6b6357, fills #ffd166 (yellow), #9bd1b9 (green), #9ac7ea (blue), #f4a7a7 (pink), #e6dfd0 (sand). Strokes 2px in #2b2b2b.
- Labels in English, very short, font-family="system-ui, sans-serif", size 11 to 14, text-anchor="middle" and placed so nothing overflows the 400x240 box.
- No <script>, no <image>, no <foreignObject>, no external hrefs, no CSS, no filters, no gradients. Under 4000 characters.`;

const user = `Write the entry for ${date}.

Main subject: ${subject} (${subjects[subject].en}). Pick ONE concept from that subject that a curious non-expert would most want explained next. Prefer fundamental, frequently heard concepts over obscure ones.
${args.topic ? `The concept MUST be: ${args.topic}.\n` : ""}
Already published (do not repeat these or near-duplicates):
${taken.length ? taken.map((x) => `- ${x}`).join("\n") : "- (nothing yet)"}`;

if (args.dry) {
  console.log("--- system ---\n" + system + "\n--- user ---\n" + user);
  process.exit(0);
}

// ---- call Claude --------------------------------------------------------------
const client = new Anthropic();
console.log(`Generating ${date} · subject ${subject} · model ${MODEL}`);
let response;
try {
  response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Entry) },
    system,
    messages: [{ role: "user", content: user }],
  });
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError) fail("No valid Anthropic credentials. Set ANTHROPIC_API_KEY or run `ant auth login`.");
  if (err instanceof Anthropic.RateLimitError) fail("Rate limited by the Anthropic API. Try again in a minute.");
  if (err instanceof Anthropic.APIError) fail(`Anthropic API error ${err.status}: ${err.message}`);
  throw err;
}
if (response.stop_reason === "refusal") fail(`The model declined this request (${response.stop_details?.category ?? "no category"}). Try --topic or another --subject.`);
if (response.stop_reason === "max_tokens") fail("The response was cut off by max_tokens. Try again.");
const out = response.parsed_output;
if (!out) fail("The response did not match the schema.");

// ---- validate and write -----------------------------------------------------------
const slug = out.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "entry";
const id = `${date}-${slug}`;
if (existingFiles.includes(id + ".json")) fail(`${id} already exists.`);
if (out.subjects[0] !== subject) out.subjects = [subject, ...out.subjects.filter((s) => s !== subject)].slice(0, 2);
for (const lang of ["en", "es"]) {
  out[lang].links = out[lang].links.filter((l) => /^https:\/\/[^\s]+$/.test(l.url));
  if (out[lang].links.length < 1) fail(`${lang}: no valid https links came back.`);
}
const svg = sanitizeSvg(out.svg) ?? placeholderSvg(out.en.title);

const entry = {
  id,
  date,
  subjects: out.subjects,
  level: out.level,
  aliases: out.aliases,
  image: `img/${id}.svg`,
  imageAlt: out.imageAlt,
  en: out.en,
  es: out.es,
};
await writeFile(path.join(root, "content", "img", `${id}.svg`), svg + "\n");
await writeFile(path.join(entriesDir, `${id}.json`), JSON.stringify(entry, null, 2) + "\n");
console.log(`Wrote ${id} (${out.en.title} / ${out.es.title}) · tokens in ${response.usage.input_tokens}, out ${response.usage.output_tokens}`);

const idx = spawnSync(process.execPath, [path.join(root, "scripts", "build-index.mjs")], { stdio: "inherit" });
if (idx.status !== 0) fail("build-index failed; the entry was written but the index was not updated.");

// ---- helpers -----------------------------------------------------------------------
function sanitizeSvg(s) {
  if (typeof s !== "string") return null;
  const svg = s.trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) return null;
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) return null;
  if (!/viewBox="0 0 400 240"/.test(svg)) return null;
  if (svg.length > 6000) return null;
  if (/<\s*(script|image|foreignObject|iframe|use|style|link|a)\b/i.test(svg)) return null;
  if (/\bon[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg) || /href\s*=/i.test(svg) || /url\(/i.test(svg)) return null;
  return svg;
}
function placeholderSvg(title) {
  const safe = String(title).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img">
  <rect width="400" height="240" rx="16" fill="#f3efe6"/>
  <circle cx="200" cy="100" r="46" fill="#ffd166" stroke="#2b2b2b" stroke-width="2"/>
  <text x="200" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="#2b2b2b">${safe}</text>
</svg>`;
}
function todayInArgentina() {
  // en-CA gives YYYY-MM-DD; the cron fires at 08:00 Argentina time, so "today" is Argentina's.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") out.dry = true;
    else if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}
function fail(msg) { console.error(msg); process.exit(1); }
