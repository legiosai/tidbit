// Checks that every term made it everywhere it has to be, after `npm run build`. Runs in CI on every push and pull
// request; a contributor can run it locally with `npm run check`.
//
//   node scripts/check.mjs                 # the built site, the API, the worker and the MCP server, offline
//   node scripts/check.mjs --links         # also: external links of the entries changed against origin/main answer
//   node scripts/check.mjs --links=all     # external links of every entry
//
// Offline checks run the real Cloudflare worker (site/_worker.js) against dist/ with a stand-in for the Pages
// asset server, so Markdown negotiation, the JSON API errors and every MCP tool are tested without deploying.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const args = process.argv.slice(2);
const linksMode = args.find((a) => a.startsWith("--links"))?.split("=")[1] ?? (args.includes("--links") ? "changed" : null);

if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ is missing: run `npm run build` first.");
  process.exit(1);
}

const problems = [];
const warnings = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const read = (rel) => readFile(path.join(dist, rel), "utf8");
const exists = (rel) => existsSync(path.join(dist, rel));

const api = JSON.parse(await read("v1/terms.json"));
const site = new URL(api.terms[0].en.url).origin;
const files = (await readdir(path.join(root, "content", "entries"))).filter((f) => f.endsWith(".json")).sort();
const today = new Date().toISOString().slice(0, 10);
const entries = [];
for (const f of files) {
  const e = JSON.parse(await readFile(path.join(root, "content", "entries", f), "utf8"));
  if (e.date <= today) entries.push({ ...e, slug: e.id.slice(11), file: `content/entries/${f}` });
}
const bySlug = new Map(api.terms.map((t) => [t.slug, t]));
const prefix = (lang) => (lang === "es" ? "/es" : "");

// ---------- 1. every entry, everywhere ----------
const sitemap = await read("sitemap.xml");
const llms = await read("llms.txt");
const llmsFull = { en: await read("llms-full.txt"), es: await read("es/llms-full.txt") };
const az = { en: await read("a-z/index.html"), es: await read("es/a-z/index.html") };
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

for (const e of entries) {
  const where = e.file;
  if (!bySlug.has(e.slug)) { fail(where, `missing from /v1/terms.json`); continue; }
  if (!exists(`v1/terms/${e.slug}.json`)) fail(where, `missing /v1/terms/${e.slug}.json`);
  if (!exists(`content/${e.image}`)) fail(where, `image ${e.image} was not published`);
  if (!llms.includes(`${site}/${e.slug}/index.md`)) fail(where, "not listed in llms.txt");
  for (const lang of ["en", "es"]) {
    const c = e[lang];
    const page = `${prefix(lang).slice(1)}${prefix(lang) ? "/" : ""}${e.slug}/`;
    const url = `${site}${prefix(lang)}/${e.slug}/`;
    if (!exists(`${page}index.html`)) { fail(where, `no ${lang} page at /${page}`); continue; }
    const html = await read(`${page}index.html`);
    const md = exists(`${page}index.md`) ? await read(`${page}index.md`) : null;
    if (!md) fail(where, `no ${lang} Markdown twin at /${page}index.md`);
    else {
      if (!md.startsWith(`# ${c.title}\n`)) fail(where, `${lang} Markdown does not start with its title`);
      for (const p of c.explanation) if (!md.includes(p)) fail(where, `${lang} Markdown is missing an explanation paragraph`);
    }
    if (!html.includes(`<link rel="canonical" href="${url}">`)) fail(where, `${lang} page has no canonical ${url}`);
    for (const l of ["en", "es"]) if (!html.includes(`hreflang="${l}" href="${site}${prefix(l)}/${e.slug}/"`)) fail(where, `${lang} page lacks hreflang ${l}`);
    if (!/<h1>[^<]+<\/h1>/.test(html) || !unescape(html.match(/<h1>([^<]+)<\/h1>/)[1]).includes(c.title)) fail(where, `${lang} page h1 is not the title`);
    if (!unescape(html).includes(`<meta name="description" content="${c.tagline}">`)) fail(where, `${lang} page description is not the tagline`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const term = ld.find((o) => o["@type"] === "DefinedTerm");
    if (!term) fail(where, `${lang} page has no DefinedTerm JSON-LD`);
    else if (term.name !== c.title || term.url !== url) fail(where, `${lang} DefinedTerm JSON-LD has the wrong name or url`);
    if (!html.includes(`src="/content/${e.image}"`)) fail(where, `${lang} page does not show its image`);
    if (!sitemap.includes(`<loc>${url}</loc>`)) fail(where, `${lang} page is not in sitemap.xml`);
    if (!llmsFull[lang].includes(`## ${c.title}\n`)) fail(where, `not in ${lang} llms-full.txt`);
    if (!az[lang].includes(`href="${prefix(lang)}/${e.slug}/"`)) fail(where, `not in the ${lang} A–Z list`);
    for (const s of e.subjects) {
      const topic = await read(`${prefix(lang).slice(1)}${prefix(lang) ? "/" : ""}topics/${s}/index.html`);
      if (!topic.includes(`href="${prefix(lang)}/${e.slug}/"`)) fail(where, `not on the ${lang} topic page ${s}`);
    }
    // Automatic links must lead to pages that exist.
    for (const m of html.matchAll(/<a class="term" href="([^"]+)">/g)) {
      if (!exists(`${m[1].replace(/^\//, "")}index.html`)) fail(where, `${lang} links a term to ${m[1]}, which does not exist`);
    }
  }
}

// ---------- 2. aliases that would link the wrong entry ----------
const owner = { en: new Map(), es: new Map() };
for (const e of entries) {
  for (const lang of ["en", "es"]) {
    const fold = (x) => (e.caseSensitive ? x.trim() : x.trim().toLowerCase()); // "ARM" is not "Arm" for a case-sensitive entry
    const own = fold(e[lang].title);
    for (const a of e.aliases[lang]) {
      const k = fold(a);
      if (k === own) warn(e.file, `${lang} alias "${a}" repeats the title (CONTRIBUTING: do not include the title)`);
      if (k.length < 2) fail(e.file, `${lang} alias "${a}" is too short to link`);
    }
    for (const term of [e[lang].title, ...e.aliases[lang]]) {
      const k = term.trim().toLowerCase();
      const prev = owner[lang].get(k);
      if (prev && prev !== e.file) fail(e.file, `${lang} "${term}" is also a title or alias of ${prev}; only one entry can own a term`);
      else owner[lang].set(k, e.file);
    }
  }
}
// Names that are also everyday words must be case-sensitive, or they link inside ordinary sentences.
const COMMON = new Set(["arm", "meta", "apple", "amazon", "token", "port", "packet", "router", "prompt", "container", "git", "rust", "go", "swift", "oracle", "shell", "python", "java", "edge", "spark", "kafka", "snowflake"]);
const prose = entries.map((e) => [...e.en.explanation, e.en.analogy, ...e.es.explanation, e.es.analogy].join(" ")).join(" ");
for (const e of entries) {
  if (e.caseSensitive || !e.subjects.includes("companies")) continue;
  const k = e.en.title.toLowerCase();
  if (COMMON.has(k) || new RegExp(`(?<![\\p{L}])${k}(?![\\p{L}])`, "u").test(prose.replace(new RegExp(e.en.title, "g"), ""))) {
    warn(e.file, `company "${e.en.title}" also appears as an ordinary word; consider "caseSensitive": true`);
  }
}

// ---------- 3. the worker and the MCP server, offline ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };
async function assetFetch(input) {
  const url = new URL(typeof input === "string" ? input : input.url ?? input);
  let rel = decodeURIComponent(url.pathname).replace(/^\//, "");
  let file = path.join(dist, rel);
  if (rel === "" || rel.endsWith("/")) file = path.join(file, "index.html");
  else if (!path.extname(rel) && existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
  const ok = existsSync(file) && (await stat(file)).isFile();
  if (!ok) return new Response(await read("404.html"), { status: 404, headers: { "Content-Type": TYPES[".html"] } });
  return new Response(await readFile(file), { status: 200, headers: { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" } });
}
const worker = (await import(pathToFileURL(path.join(dist, "_worker.js")).href)).default;
const env = { ASSETS: { fetch: assetFetch } };
// Every request comes from a different made-up client so the worker's fair-use limit never trips during the check.
let client = 0;
const call = (p, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", `check-${++client}`);
  return worker.fetch(new Request(new URL(p, site), { ...init, headers }), env);
};
const mcp = async (method, params) => {
  const r = await call("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
};

const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "0" } });
if (!init.result?.serverInfo) fail("site/_worker.js", "MCP initialize did not answer");
const tools = (await mcp("tools/list", {})).result?.tools ?? [];
for (const name of ["define", "search_terms", "get_term", "list_topic", "term_of_the_day"]) if (!tools.some((t) => t.name === name)) fail("site/_worker.js", `MCP tool ${name} is missing`);
const toolChars = JSON.stringify(tools).length;
if (toolChars > 4000) warn("site/_worker.js", `MCP tool definitions are ${toolChars} characters; agents pay for them on every request, keep them under 4000`);

const toolText = async (name, a) => (await mcp("tools/call", { name, arguments: a })).result?.content?.[0]?.text ?? "";
for (const e of entries) {
  for (const lang of ["en", "es"]) {
    const c = e[lang];
    const url = `${site}${prefix(lang)}/${e.slug}/`;
    const defined = await toolText("define", { terms: [c.title], lang });
    if (!defined.includes(url)) fail(e.file, `MCP define("${c.title}", ${lang}) does not return this entry`);
    for (const a of e.aliases[lang].slice(0, 3)) {
      const viaAlias = await toolText("define", { terms: [a], lang });
      if (!viaAlias.includes(url)) fail(e.file, `MCP define("${a}", ${lang}) does not find this entry by its alias`);
    }
    const full = await toolText("get_term", { term: e.slug, lang });
    if (!full.startsWith(`# ${c.title}`)) fail(e.file, `MCP get_term("${e.slug}", ${lang}) does not return its Markdown`);
    const found = await toolText("search_terms", { query: c.title, lang, limit: 3 });
    if (!found.includes(url)) fail(e.file, `MCP search_terms("${c.title}", ${lang}) does not find it in the top 3`);
    const r = await call(`${prefix(lang)}/${e.slug}/`, { headers: { Accept: "text/markdown" } });
    if (r.status !== 200 || !(r.headers.get("Content-Type") || "").startsWith("text/markdown") || !(r.headers.get("Vary") || "").includes("Accept")) {
      fail(e.file, `Accept: text/markdown on ${prefix(lang)}/${e.slug}/ does not return Markdown with Vary: Accept`);
    }
  }
}
const nf = await call("/v1/terms/__nope__.json");
if (nf.status !== 404 || !(nf.headers.get("Content-Type") || "").includes("problem+json")) fail("site/_worker.js", "the API does not answer missing terms with a 404 problem+json");
const nfMd = await call("/__nope__/", { headers: { Accept: "text/markdown" } });
if (nfMd.status !== 404 || !(nfMd.headers.get("Content-Type") || "").startsWith("text/markdown")) fail("site/_worker.js", "a missing page does not answer Markdown 404s");

// ---------- 4. external links (network) ----------
async function check(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; tidbit-link-check; +https://github.com/legiosai/tidbit)" }, signal: AbortSignal.timeout(20000) });
      return r.status;
    } catch { if (i) return 0; }
  }
}
if (linksMode) {
  let targets = entries;
  if (linksMode !== "all") {
    let changed = [];
    try {
      const base = process.env.LINK_BASE ?? "origin/main";
      changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`, "--", "content/entries"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
      changed.push(...execFileSync("git", ["diff", "--name-only", "HEAD", "--", "content/entries"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));
    } catch { warn("links", "could not diff against origin/main; checking every entry"); changed = files.map((f) => `content/entries/${f}`); }
    targets = entries.filter((e) => changed.includes(e.file));
  }
  const urls = new Map();
  for (const e of targets) for (const lang of ["en", "es"]) for (const l of e[lang].links) urls.set(l.url, e.file);
  for (const [url, file] of urls) {
    const status = await check(url);
    if (status === 404 || status === 410 || status === 0) fail(file, `link ${url} answers ${status || "nothing (DNS or timeout)"}`);
    else if (status >= 400) warn(file, `link ${url} answers ${status} to an automated check; open it by hand to be sure`);
  }
  console.log(`links: checked ${urls.size} URL(s) from ${targets.length} entr${targets.length === 1 ? "y" : "ies"}`);
}

for (const w of warnings) console.warn(`warning  ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`error    ${p}`);
  console.error(`\n${problems.length} problem(s). See CONTRIBUTING.md.`);
  process.exit(1);
}
console.log(`check: ${entries.length} terms are on every page, in the API, the MCP server, llms.txt and the sitemap (${warnings.length} warning(s)).`);
