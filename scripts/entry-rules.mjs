// The rules every Tidbit entry follows, in one place, with no Node APIs so the same file runs in three spots:
//   - scripts/build-index.mjs validates every committed entry with validateEntry + validateSvg;
//   - the /contribute/ page imports it in the browser (published as /entry-rules.js) to check a draft as it is typed;
//   - scripts/contribution.mjs checks a contribution sent as a GitHub issue before a maintainer accepts it.
// CONTRIBUTING.md explains the same rules in words.

export const LANGS = ["en", "es"];
export const PALETTE = ["#f3efe6", "#2b2b2b", "#6b6357", "#ffd166", "#9bd1b9", "#9ac7ea", "#f4a7a7", "#e6dfd0"];
export const SVG_START = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img">';
export const SVG_BACKGROUND = '<rect width="400" height="240" rx="16" fill="#f3efe6"/>';
// Hard caps for contributions, so a form or an issue cannot carry a novel.
export const LIMITS = { title: 60, tagline: 90, paragraph: 900, analogy: 500, keyPoint: 200, alias: 60, aliases: 12, imageAlt: 200, linkLabel: 120, url: 300, svg: 6000 };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isStr = (x) => typeof x === "string" && x.trim() !== "";

// The checks build-index.mjs has always run. Messages say what to fix.
export function validateEntry(e, { subjects }) {
  const problems = [];
  const say = (m) => problems.push(m);
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["the entry must be a JSON object"];
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(e.id ?? "")) say(`id must be YYYY-MM-DD-slug (ascii kebab-case)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "")) say(`bad date "${e.date}"`);
  if (!String(e.id ?? "").startsWith(e.date + "-")) say(`id must start with the date`);
  if (!Array.isArray(e.subjects) || e.subjects.length < 1 || e.subjects.length > 2) say(`subjects must have 1 or 2 ids`);
  else if (new Set(e.subjects).size !== e.subjects.length) say(`subjects repeats a topic`);
  for (const s of Array.isArray(e.subjects) ? e.subjects : []) if (!Object.hasOwn(subjects, s)) say(`unknown subject "${s}"`);
  if (![1, 2, 3].includes(e.level)) say(`level must be 1, 2 or 3 (got ${JSON.stringify(e.level)})`);
  if (e.caseSensitive !== undefined && typeof e.caseSensitive !== "boolean") say(`caseSensitive must be true or false`);
  for (const lang of LANGS) {
    const aliases = e.aliases?.[lang];
    if (!Array.isArray(aliases)) say(`aliases.${lang} must be an array (can be empty)`);
    else if (aliases.some((a) => typeof a !== "string")) say(`aliases.${lang} must only contain text`);
    if (!isStr(e.imageAlt?.[lang])) say(`imageAlt.${lang} missing`);
    const c = e[lang];
    if (!c || typeof c !== "object") { say(`${lang} missing`); continue; }
    if (!isStr(c.title)) say(`${lang}.title missing`);
    if (!isStr(c.tagline)) say(`${lang}.tagline missing`);
    else if (c.tagline.length > 110) say(`${lang}.tagline is ${c.tagline.length} chars, keep it under 90`);
    if (!Array.isArray(c.explanation) || c.explanation.length < 2 || c.explanation.length > 4 || !c.explanation.every(isStr)) say(`${lang}.explanation needs 2 to 4 paragraphs`);
    if (!isStr(c.analogy)) say(`${lang}.analogy missing`);
    if (!Array.isArray(c.keyPoints) || c.keyPoints.length < 3 || c.keyPoints.length > 4 || !c.keyPoints.every(isStr)) say(`${lang}.keyPoints needs 3 or 4 items`);
    if (!Array.isArray(c.links) || c.links.length < 1 || c.links.length > 3) say(`${lang}.links needs 1 to 3 items`);
    for (const l of Array.isArray(c.links) ? c.links : []) {
      if (!isStr(l?.label) || !/^https:\/\/\S+$/.test(l?.url ?? "")) say(`${lang}: bad link ${JSON.stringify(l)}`);
    }
    const texts = [...(Array.isArray(c.explanation) ? c.explanation : []), c.analogy, ...(Array.isArray(c.keyPoints) ? c.keyPoints : [])];
    for (const txt of texts.filter((x) => typeof x === "string")) {
      // Tags are fine inside `code` (the site escapes it); anywhere else they would be raw HTML.
      if (/<[a-z/]/i.test(txt.replace(/`[^`]*`/g, ""))) say(`${lang}: HTML is not allowed in text, put tags inside backticks ("${txt.slice(0, 40)}…")`);
    }
  }
  if (e.image !== `img/${e.id}.svg`) say(`image must be "img/${e.id}.svg"`);
  return problems;
}

// The illustration: an SVG with our viewBox and nothing active in it. strict adds the rules a contribution must
// follow (the palette, the background, the size), which a few early illustrations predate.
export function validateSvg(svg, { strict = false } = {}) {
  const problems = [];
  const say = (m) => problems.push(m);
  if (typeof svg !== "string" || !svg.trim()) return ["the illustration is missing"];
  if (!/^\s*<svg[\s>]/i.test(svg)) say(`image does not start with <svg`);
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) say(`image needs the svg xmlns`);
  if (!/viewBox="0 0 400 240"/.test(svg)) say(`image needs viewBox="0 0 400 240"`);
  if (/<\s*(script|image|foreignObject|iframe|style|link|a)\b/i.test(svg)) say(`image contains a forbidden element`);
  if (/\bon[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg) || /href\s*=\s*"(?!#)/i.test(svg) || /url\(/i.test(svg)) say(`image contains an active attribute`);
  if (svg.length > (strict ? LIMITS.svg : 8000)) say(`image is ${svg.length} chars, keep it under 6000`);
  if (!strict) return problems;
  if (!/<\/svg>\s*$/i.test(svg)) say(`image must end with </svg>`);
  const first = svg.replace(/^\s*<svg[^>]*>\s*/i, "");
  if (!/^<rect\s+width="400"\s+height="240"\s+rx="16"\s+fill="#f3efe6"\s*\/>/i.test(first)) say(`the first element must be the background: ${SVG_BACKGROUND}`);
  const allowed = new Set(["svg", "defs", "use", "rect", "circle", "ellipse", "line", "path", "polyline", "polygon", "text", "tspan", "g", "title", "desc"]);
  for (const m of svg.matchAll(/<\s*([a-zA-Z][\w:-]*)/g)) if (!allowed.has(m[1])) { say(`image uses <${m[1]}>; only basic shapes, text and groups are allowed`); break; }
  if (/<!|<\?/.test(svg)) say(`image cannot contain comments, doctypes or processing instructions`);
  if (/\b(filter|mask|clip-path|style|class)\s*=/i.test(svg)) say(`image cannot use filters, masks, clip paths, styles or classes`);
  const palette = new Set([...PALETTE, "none"]);
  const off = new Set();
  for (const m of svg.matchAll(/\b(?:fill|stroke)\s*=\s*"([^"]*)"/gi)) if (!palette.has(m[1].trim().toLowerCase())) off.add(m[1]);
  if (off.size) say(`image uses colors outside the palette: ${[...off].slice(0, 5).join(", ")}`);
  // Balanced tags is as much XML as we can check without a parser that exists in both Node and the browser.
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) { say(`image is not valid XML: </${m[2]}> closes the wrong tag`); break; }
  }
  if (stack.length) say(`image is not valid XML: <${stack.at(-1)}> is never closed`);
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(svg)) say(`image is not valid XML: write & as &amp;`);
  return problems;
}

// A title or alias can belong to one entry only, or the automatic links would not know where to go.
// existing: [{ id, title: { en, es }, aliases: { en: [], es: [] } }], the shape of content/index.json and /v1/terms.json.
export function termConflicts(e, existing) {
  const problems = [];
  const owner = { en: new Map(), es: new Map() };
  for (const x of existing) {
    if (x.id === e.id) continue;
    for (const lang of LANGS) for (const t of [x.title?.[lang], ...(x.aliases?.[lang] ?? [])]) if (t) owner[lang].set(t.trim().toLowerCase(), x);
  }
  for (const lang of LANGS) {
    const fold = (s) => (e.caseSensitive ? s.trim() : s.trim().toLowerCase());
    const own = fold(e[lang]?.title ?? "");
    const seen = new Set();
    for (const t of [e[lang]?.title, ...(e.aliases?.[lang] ?? [])]) {
      if (typeof t !== "string" || !t.trim()) continue;
      const k = t.trim().toLowerCase();
      const prev = owner[lang].get(k);
      if (prev) problems.push(`${lang} "${t}" already belongs to "${prev.title?.[lang] ?? prev.id}"; link to that entry instead, or pick another word`);
      if (seen.has(k)) problems.push(`${lang} "${t}" is listed twice`);
      seen.add(k);
    }
    for (const a of e.aliases?.[lang] ?? []) {
      if (typeof a !== "string") continue;
      if (fold(a) === own) problems.push(`${lang} alias "${a}" repeats the title; leave the title out of the aliases`);
      if (a.trim().length < 2) problems.push(`${lang} alias "${a}" is too short to link`);
    }
  }
  return problems;
}

// Everything a contribution must pass before a maintainer reads it: the entry rules, the strict illustration rules,
// the limits, and no clash with the terms that already exist. date and id are set when it is accepted, so a draft
// can come without them; slug is what the URL will be.
export function validateContribution(draft, { subjects, svg, existing = [], today = "2000-01-01" }) {
  const problems = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return ["the entry must be a JSON object"];
  const known = new Set(["id", "date", "slug", "subjects", "level", "caseSensitive", "aliases", "image", "imageAlt", "en", "es"]);
  for (const k of Object.keys(draft)) if (!known.has(k)) problems.push(`unknown field "${k}"`);
  const slug = draft.slug ?? String(draft.id ?? "").slice(11);
  if (!SLUG.test(slug) || slug.length > 60) problems.push(`slug must be ascii kebab-case, like "data-lake" (got "${slug}")`);
  const entry = toEntry(draft, today);
  problems.push(...validateEntry(entry, { subjects }).filter((p) => !/^(id|bad date|image must)/.test(p)));
  problems.push(...validateSvg(svg, { strict: true }));
  for (const lang of LANGS) {
    const c = draft[lang];
    if (!c || typeof c !== "object") continue;
    const over = (what, s, max) => typeof s === "string" && s.length > max && problems.push(`${lang}.${what} is ${s.length} characters, the limit is ${max}`);
    over("title", c.title, LIMITS.title);
    if (typeof c.title === "string" && c.title.trim().split(/\s+/).length > 4) problems.push(`${lang}.title should be 1 to 4 words`);
    over("tagline", c.tagline, LIMITS.tagline);
    (Array.isArray(c.explanation) ? c.explanation : []).forEach((p, i) => over(`explanation[${i + 1}]`, p, LIMITS.paragraph));
    over("analogy", c.analogy, LIMITS.analogy);
    (Array.isArray(c.keyPoints) ? c.keyPoints : []).forEach((p, i) => over(`keyPoints[${i + 1}]`, p, LIMITS.keyPoint));
    if (Array.isArray(c.links) && c.links.length < 2) {
      const i = problems.indexOf(`${lang}.links needs 1 to 3 items`);
      if (i >= 0) problems.splice(i, 1);
      problems.push(`${lang}.links needs 2 or 3 sources`);
    }
    for (const l of Array.isArray(c.links) ? c.links : []) {
      over("link label", l?.label, LIMITS.linkLabel);
      over("link url", l?.url, LIMITS.url);
      try { const u = new URL(l?.url); if (u.username || u.password) problems.push(`${lang}: links cannot carry a user or password`); } catch { /* reported above */ }
    }
    over("imageAlt", draft.imageAlt?.[lang], LIMITS.imageAlt);
    const aliases = Array.isArray(draft.aliases?.[lang]) ? draft.aliases[lang] : [];
    if (aliases.length > LIMITS.aliases) problems.push(`aliases.${lang} has ${aliases.length} items, the limit is ${LIMITS.aliases}`);
    aliases.forEach((a) => over("alias", a, LIMITS.alias));
    for (const txt of [c.title, c.tagline, ...(Array.isArray(c.keyPoints) ? c.keyPoints : [])]) {
      if (typeof txt === "string" && /\n/.test(txt)) problems.push(`${lang}: titles, taglines and key points are one line each`);
    }
  }
  if (draft.en?.title && draft.es?.title) problems.push(...termConflicts(entry, existing));
  if (existing.some((x) => String(x.id).slice(11) === slug)) problems.push(`there is already an entry at /${slug}/; suggest a change to it instead`);
  return [...new Set(problems)];
}

// A draft (with or without date and id) as the entry file it becomes on a given day.
export function toEntry(draft, date) {
  const slug = draft.slug ?? String(draft.id ?? "").slice(11);
  const id = `${date}-${slug}`;
  const out = { id, date, subjects: draft.subjects, level: draft.level };
  if (draft.caseSensitive === true) out.caseSensitive = true;
  Object.assign(out, { aliases: draft.aliases, image: `img/${id}.svg`, imageAlt: draft.imageAlt, en: draft.en, es: draft.es });
  return out;
}
