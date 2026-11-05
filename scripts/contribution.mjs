// Reads a "New term" issue (.github/ISSUE_TEMPLATE/new-term.yml, filled by the /contribute/ form) and checks the
// entry in it with the same rules as every other entry (entry-rules.mjs). Used by .github/workflows/contribution.yml.
//
//   node scripts/contribution.mjs check  <issue-body-file>                 prints a Markdown report; exit 1 if it fails
//   node scripts/contribution.mjs accept <issue-body-file> [YYYY-MM-DD]    writes content/entries/<id>.json and its SVG
//
// The issue body is untrusted text: it is only parsed as JSON and checked, never run or put in a shell command.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toEntry, validateContribution } from "./entry-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, bodyFile, dateArg] = process.argv.slice(2);
if (!["check", "accept"].includes(mode) || !bodyFile) {
  console.error("usage: node scripts/contribution.mjs check|accept <issue-body-file> [YYYY-MM-DD]");
  process.exit(2);
}
const today = dateArg ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) { console.error(`bad date ${today}`); process.exit(2); }

const MARKER = "<!-- tidbit-contribution-check -->";
const body = (await readFile(bodyFile, "utf8")).slice(0, 100_000).replace(/\r\n/g, "\n");
const subjects = JSON.parse(await readFile(path.join(root, "content", "subjects.json"), "utf8"));
const index = JSON.parse(await readFile(path.join(root, "content", "index.json"), "utf8"));

// The entry is the first ```json block (the form writes one); a bare JSON object pasted into the box works too.
function extract(text) {
  const section = text.split(/^### /m).find((s) => s.startsWith("Entry\n")) ?? text;
  const fenced = section.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const raw = fenced ? fenced[1] : section.slice(section.indexOf("{"), section.lastIndexOf("}") + 1);
  if (!raw.trim()) return { error: "No entry found. Paste the JSON from the form between ```json fences." };
  try { return { value: JSON.parse(raw) }; } catch (err) { return { error: `The entry is not valid JSON: ${err.message}` }; }
}

const parsed = extract(body);
let problems = [];
let draft = null;
let svg = "";
if (parsed.error) problems = [parsed.error];
else if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) problems = ["The entry must be a JSON object."];
else {
  ({ svg = "", ...draft } = parsed.value);
  delete draft.id; delete draft.date; delete draft.image; // set here, on the day it is accepted
  problems = validateContribution(draft, { subjects, svg, existing: index.entries, today });
}

if (mode === "check") {
  const c = (L) => draft?.[L] ?? {};
  const lines = [MARKER];
  if (problems.length) {
    lines.push("### ❌ This entry needs changes", "", "Edit the issue (or fix it in the form at https://tidbit.legios.com.ar/contribute/ and paste the new JSON) and this check runs again:", "", ...problems.map((p) => `- ${p}`));
  } else {
    lines.push("### ✅ The entry follows every rule", "",
      `| | English | Spanish |`, `|---|---|---|`,
      `| Title | ${cell(c("en").title)} | ${cell(c("es").title)} |`,
      `| Definition | ${cell(c("en").tagline)} | ${cell(c("es").tagline)} |`,
      `| URL | \`/${draft.slug}/\` | \`/es/${draft.slug}/\` |`,
      "", `Topics: ${draft.subjects.map((s) => subjects[s].en).join(", ")} · level ${draft.level}.`,
      "", "A maintainer will review the content and the sources. Adding the `accepted` label opens a pull request with the entry; its links are checked there.");
  }
  console.log(lines.join("\n"));
  process.exit(problems.length ? 1 : 0);
}

// accept
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
const entry = toEntry(draft, today);
await writeFile(path.join(root, "content", "entries", `${entry.id}.json`), JSON.stringify(entry, null, 2) + "\n");
await writeFile(path.join(root, "content", "img", `${entry.id}.svg`), svg.trim() + "\n");
console.log(entry.id);

function cell(s) {
  return String(s ?? "").replace(/[|\n]/g, " ").replace(/[<>]/g, (ch) => (ch === "<" ? "&lt;" : "&gt;")).slice(0, 200);
}
