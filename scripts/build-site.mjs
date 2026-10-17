// Builds the whole site into dist/: every URL as a real HTML page (readable without JavaScript) plus its Markdown
// twin (index.md next to index.html), in English at / and Spanish at /es/. Also the files search engines and AI
// agents read: sitemap, robots, llms.txt, a JSON API, OpenAPI, MCP discovery and an agent skill.
// site/_worker.js (Cloudflare Pages) serves the twins on Accept: text/markdown and answers MCP at /mcp.
//
//   SITE_URL=https://tidbit.legios.com.ar node scripts/build-site.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const SITE = (process.env.SITE_URL || "https://tidbit.legios.com.ar").replace(/\/+$/, "");
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const REPO = "https://github.com/legiosai/tidbit";
const RATE = { limit: 300, window: 60 }; // fair use per client, enforced (approximately) by site/_worker.js
const ORG = { name: "Legios", url: "https://github.com/legiosai", city: "Rosario", region: "Santa Fe", country: "AR" };
const LANGS = ["en", "es"];

// Validate the entries and refresh content/index.json first; it exits non-zero on any problem.
execFileSync(process.execPath, [path.join(root, "scripts", "build-index.mjs")], { stdio: "inherit" });

const subjects = JSON.parse(await readFile(path.join(root, "content", "subjects.json"), "utf8"));
const index = JSON.parse(await readFile(path.join(root, "content", "index.json"), "utf8"));
// Entries dated in the future stay out until a build on or after their day.
const entries = [];
for (const meta of index.entries) {
  if (meta.date > TODAY) continue;
  const e = JSON.parse(await readFile(path.join(root, "content", "entries", `${meta.id}.json`), "utf8"));
  entries.push({ ...e, slug: e.id.slice(11) });
}
const bySlug = new Map();
for (const e of entries) {
  if (bySlug.has(e.slug)) throw new Error(`slug "${e.slug}" is used by ${bySlug.get(e.slug).id} and ${e.id}`);
  bySlug.set(e.slug, e);
}
const RESERVED = new Set(["a-z", "topics", "learned", "about", "contact", "privacy", "developers", "v1", "content", "es", "mcp", "skills"]);
for (const s of bySlug.keys()) if (RESERVED.has(s)) throw new Error(`slug "${s}" collides with a site page`);

// ---------- words ----------
const T = {
  en: {
    locale: "en-US", ogLocale: "en_US", other: "es", switchLabel: "Leer en castellano",
    siteTitle: "Tidbit · The tech dictionary, explained simply",
    siteDescription: "A free bilingual dictionary of technology: AI, cloud, AWS, networks, security, data, hardware and tech companies. Every term in plain words, with an analogy, a diagram and official sources.",
    nav: { home: "Home", az: "A–Z", topics: "Topics", learned: "Learned" },
    skip: "Skip to content",
    heroKicker: (n) => `${n} terms · English and Spanish · free`,
    heroH1: "The tech dictionary, explained simply.",
    heroLead: "What is an API, a token, a data lake or a VPN? Tidbit explains technology terms in plain words for curious people who are not engineers, with an everyday analogy, a diagram and links to the official documentation. Every term exists in English and Spanish.",
    searchLabel: "Search the dictionary", searchPlaceholder: "Search a term: API, DNS, Parquet…", searchButton: "Search",
    popular: "Start with",
    todaysPick: "Today's tidbit", todayNote: "One new term every day you visit. A new one tomorrow.",
    earlier: "Your previous days", dayN: "Day {n}",
    bySubject: "Browse by topic", newest: "Newest terms", allTerms: "All terms, A to Z", seeAll: "See all terms",
    read: "Read", markLearned: "Mark as learned", learned: "Learned ✓", new: "New",
    count1: "{n} term", countN: "{n} terms", progress: "{a} of {b} learned",
    level: "Level", levels: { 1: "Basic", 2: "Intermediate", 3: "Advanced" },
    levelHint: "Basic reads cold. Intermediate assumes the basics of its topic. Advanced assumes intermediate.",
    analogy: "An analogy", points: "Keep in mind", links: "Go deeper", related: "Related terms", more: "More in",
    prev: "Previous", next: "Next", back: "All terms", published: "Published",
    azTitle: "All terms, A to Z", azDescription: "Every technology term in Tidbit, in alphabetical order, with a one-line definition.",
    letters: "Jump to letter", topicsFilter: "Filter by topic", onlyNew: "Only what I haven't learned yet", clear: "Clear filters",
    none: "Nothing matches those filters.",
    topicsTitle: "Topics", topicsDescription: "Technology terms grouped by topic, from the basics to advanced.",
    topicLead: (label, n) => `${n} ${label} terms explained simply, ordered from basic to advanced. Start at the top if the topic is new to you.`,
    learnedTitle: "What you learned", noneLearned: "Nothing learned yet. Open a term and mark it when it clicks.",
    footProgress: "Your progress stays in this browser. No account, no tracking.",
    foot: { about: "About", contact: "Contact", privacy: "Privacy", developers: "Developers", source: "Source code", agents: "For AI agents" },
    madeBy: "Made by",
    notFoundTitle: "Page not found",
    notFoundLead: "That page does not exist, or it moved. Search the dictionary or start from one of these pages.",
    md: { level: "Level", topics: "Topics", other: "In Spanish", url: "URL" },
  },
  es: {
    locale: "es-AR", ogLocale: "es_AR", other: "en", switchLabel: "Read in English",
    siteTitle: "Tidbit · El diccionario tech, explicado fácil",
    siteDescription: "Un diccionario de tecnología gratis y bilingüe: IA, cloud, AWS, redes, seguridad, datos, hardware y empresas tech. Cada término en palabras simples, con una analogía, un diagrama y fuentes oficiales.",
    nav: { home: "Inicio", az: "A–Z", topics: "Temas", learned: "Aprendidas" },
    skip: "Saltar al contenido",
    heroKicker: (n) => `${n} términos · castellano e inglés · gratis`,
    heroH1: "El diccionario tech, explicado fácil.",
    heroLead: "¿Qué es una API, un token, un data lake o una VPN? Tidbit explica términos de tecnología en palabras simples, para gente curiosa que no es ingeniera, con una analogía de todos los días, un diagrama y links a la documentación oficial. Cada término está en castellano y en inglés.",
    searchLabel: "Buscar en el diccionario", searchPlaceholder: "Buscá un término: API, DNS, Parquet…", searchButton: "Buscar",
    popular: "Para arrancar",
    todaysPick: "El tidbit de hoy", todayNote: "Un término nuevo cada día que entrás. Mañana, otro.",
    earlier: "Tus días anteriores", dayN: "Día {n}",
    bySubject: "Por tema", newest: "Lo más nuevo", allTerms: "Todos los términos, de la A a la Z", seeAll: "Ver todos los términos",
    read: "Leer", markLearned: "Marcar como aprendida", learned: "Aprendida ✓", new: "Nueva",
    count1: "{n} término", countN: "{n} términos", progress: "{a} de {b} aprendidas",
    level: "Nivel", levels: { 1: "Básico", 2: "Intermedio", 3: "Avanzado" },
    levelHint: "Básico se lee sin saber nada. Intermedio asume lo básico del tema. Avanzado asume lo intermedio.",
    analogy: "Una analogía", points: "Para quedarse", links: "Para seguir leyendo", related: "Términos relacionados", more: "Más de",
    prev: "Anterior", next: "Siguiente", back: "Todos los términos", published: "Publicada",
    azTitle: "Todos los términos, de la A a la Z", azDescription: "Todos los términos de tecnología de Tidbit, en orden alfabético, con una definición de una línea.",
    letters: "Ir a la letra", topicsFilter: "Filtrar por tema", onlyNew: "Solo lo que todavía no aprendí", clear: "Limpiar filtros",
    none: "Nada coincide con esos filtros.",
    topicsTitle: "Temas", topicsDescription: "Términos de tecnología agrupados por tema, de lo básico a lo avanzado.",
    topicLead: (label, n) => `${n} términos de ${label} explicados fácil, ordenados de lo básico a lo avanzado. Si el tema es nuevo para vos, arrancá por arriba.`,
    learnedTitle: "Lo que aprendiste", noneLearned: "Todavía no marcaste nada. Abrí un término y marcalo cuando te cierre.",
    footProgress: "Tu progreso queda en este navegador. Sin cuenta y sin rastreo.",
    foot: { about: "Acerca de", contact: "Contacto", privacy: "Privacidad", developers: "Desarrolladores", source: "Código", agents: "Para agentes de IA" },
    madeBy: "Hecho por",
    notFoundTitle: "No encontramos esa página",
    notFoundLead: "Esa página no existe o se movió. Buscá en el diccionario o arrancá desde una de estas páginas.",
    md: { level: "Nivel", topics: "Temas", other: "En inglés", url: "URL" },
  },
};
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const count = (lang, n) => fmt(n === 1 ? T[lang].count1 : T[lang].countN, { n });

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Tiny inline markdown: **bold** and `code`, after escaping.
const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const prefix = (lang) => (lang === "es" ? "/es" : "");
const href = (lang, p = "/") => prefix(lang) + p;
const abs = (p) => SITE + p;
const entryPath = (lang, e) => href(lang, `/${e.slug}/`);
const subjLabel = (lang, id) => subjects[id]?.[lang] ?? id;
const fmtDate = (lang, iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(T[lang].locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const lvl = (lang, n) => `<span class="lvl lvl-${n}" title="${esc(T[lang].levelHint)}">${esc(T[lang].levels[n])}</span>`;
const tags = (lang, e) => e.subjects.map((s) => `<a class="tag" href="${href(lang, `/topics/${s}/`)}">${esc(subjLabel(lang, s))}</a>`).join("");
const tagsPlain = (lang, e) => e.subjects.map((s) => `<span class="tag">${esc(subjLabel(lang, s))}</span>`).join("");
const sortAlpha = (lang, list) => [...list].sort((a, b) => a[lang].title.localeCompare(b[lang].title, T[lang].locale, { sensitivity: "base" }));
const letterOf = (title) => {
  const c = title.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------- automatic term links ----------
// Every entry's title and aliases (per language) become links where they appear in another entry's text.
// Longest terms first so "Amazon API Gateway" wins over "API". Acronyms (all caps, short) and entries marked
// caseSensitive (proper names that are also common words) only match their exact capitalization.
const termIndex = Object.fromEntries(LANGS.map((lang) => {
  const lookup = new Map();
  for (const e of entries) {
    for (const term of [e[lang].title, ...(e.aliases?.[lang] ?? [])]) {
      const k = term.trim().toLowerCase();
      if (k.length >= 2 && !lookup.has(k)) lookup.set(k, { e, canonical: term.trim() });
    }
  }
  const words = [...lookup.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  return [lang, { re, lookup }];
}));
// html: escaped markup from md(). Links go only in text outside tags, never inside <code> or <a>.
function linkTerms(lang, html, self, linked) {
  const { re, lookup } = termIndex[lang];
  if (!re) return html;
  let depth = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith("<")) {
      if (/^<(code|a)\b/i.test(part)) depth++;
      else if (/^<\/(code|a)\b/i.test(part)) depth = Math.max(0, depth - 1);
      return part;
    }
    if (depth > 0 || !part) return part;
    return part.replace(re, (m) => {
      const hit = lookup.get(m.toLowerCase());
      if (!hit || hit.e.id === self.id || linked.has(hit.e.id)) return m;
      const isAcronym = hit.canonical.length <= 5 && hit.canonical === hit.canonical.toUpperCase();
      if ((isAcronym || hit.e.caseSensitive) && m !== hit.canonical) return m;
      linked.set(hit.e.id, hit.e);
      return `<a class="term" href="${entryPath(lang, hit.e)}">${m}</a>`;
    });
  }).join("");
}

// ---------- page shell ----------
function layout({ lang, p, title, description, body, page, jsonld = [], noindex = false, ogType = "website", hasMarkdown = true, extraConfig = {} }) {
  const t = T[lang];
  const other = t.other;
  const canonical = abs(href(lang, p));
  const navItem = (key, path) => `<a href="${href(lang, path)}"${page === key ? ' aria-current="page"' : ""}>${esc(t.nav[key])}</a>`;
  const config = {
    lang, page, total: entries.length,
    strings: {
      learned: t.learned, markLearned: t.markLearned, progress: t.progress, count1: t.count1, countN: t.countN,
      todaysPick: t.todaysPick, todayNote: t.todayNote, dayN: t.dayN, read: t.read, levels: t.levels, levelHint: t.levelHint,
      subjects: Object.fromEntries(Object.keys(subjects).map((s) => [s, subjLabel(lang, s)])),
      locale: t.locale,
    },
    ...extraConfig,
  };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#07080c">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${abs(href("en", p))}">
<link rel="alternate" hreflang="es" href="${abs(href("es", p))}">
<link rel="alternate" hreflang="x-default" href="${abs(href("en", p))}">
${hasMarkdown ? `<link rel="alternate" type="text/markdown" href="${abs(href(lang, p))}index.md">\n` : ""}<link rel="describedby" type="text/plain" href="${abs("/llms.txt")}">
<link rel="sitemap" type="application/xml" href="${abs("/sitemap.xml")}">
<meta property="og:site_name" content="Tidbit">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:image" content="${abs(`/og-${lang}.png`)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=DM+Sans:opsz,wght@9..40,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${jsonld.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join("\n")}
</head>
<body data-page="${page}">
<a class="skip" href="#main">${esc(t.skip)}</a>
<div class="readbar" id="readbar" aria-hidden="true"></div>
<header class="top">
  <a class="brand" href="${href(lang, "/")}" aria-label="Tidbit">${MARK}<span class="brand-name" aria-hidden="true">t<span class="dot-i">ı</span>db<span class="dot-i moon">ı</span>t</span></a>
  <nav class="top-nav" aria-label="${lang === "es" ? "Principal" : "Main"}">${navItem("home", "/")}${navItem("az", "/a-z/")}${navItem("topics", "/topics/")}${navItem("learned", "/learned/")}</nav>
  <div class="top-right">
    <span class="progress" id="progress"></span>
    <a class="lang" href="${href(other, p)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}" aria-label="${esc(t.switchLabel)}" title="${esc(t.switchLabel)}"><span${lang === "en" ? ' class="on"' : ""}>EN</span><span${lang === "es" ? ' class="on"' : ""}>ES</span></a>
  </div>
</header>
<main id="main" class="app">
${body}
</main>
<footer class="foot">
  <nav class="foot-links" aria-label="${lang === "es" ? "Pie de página" : "Footer"}">
    <a href="${href(lang, "/about/")}">${esc(t.foot.about)}</a>
    <a href="${href(lang, "/contact/")}">${esc(t.foot.contact)}</a>
    <a href="${href(lang, "/privacy/")}">${esc(t.foot.privacy)}</a>
    <a href="${href(lang, "/developers/")}">${esc(t.foot.developers)}</a>
    <a href="/llms.txt">${esc(t.foot.agents)}</a>
    <a href="${REPO}" rel="noopener">${esc(t.foot.source)}</a>
  </nav>
  <p>${esc(t.madeBy)} <a href="${ORG.url}" rel="noopener">Legios</a> · ${esc(t.footProgress)}</p>
</footer>
<script id="tb-config" type="application/json">${json(config)}</script>
<script src="/app.js" defer></script>
</body>
</html>
`;
}

const MARK = `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="tb-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient>
      <linearGradient id="tb-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cbbdff"/><stop offset="1" stop-color="#9d88f5"/></linearGradient>
      <mask id="tb-bite"><rect width="64" height="64" fill="#fff"/><circle cx="47.5" cy="11" r="11.5" fill="#000"/><circle cx="33.5" cy="10.5" r="5" fill="#000"/></mask>
    </defs>
    <rect x="15" y="5" width="40" height="48" rx="10" fill="url(#tb-moon)" transform="rotate(9 35 29)"/>
    <g transform="rotate(-4 30 36)">
      <rect x="9" y="11" width="42" height="49" rx="11" fill="url(#tb-sun)" mask="url(#tb-bite)"/>
      <path d="M27 22 V42 q0 7.5 7.5 7.5 h4.5 M19.5 31 H40" fill="none" stroke="#170d02" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;

// ---------- shared pieces ----------
const card = (lang, e, { hidden = false } = {}) => `<a class="card" href="${entryPath(lang, e)}" data-id="${e.id}"${hidden ? " hidden" : ""}>
  <div class="card-img"><img src="/content/${esc(e.image)}" alt="" loading="lazy" width="400" height="240"></div>
  <div class="meta">${lvl(lang, e.level)}${tagsPlain(lang, e)}</div>
  <h3>${esc(e[lang].title)}</h3>
  <p>${esc(e[lang].tagline)}</p>
</a>`;
const grid = (lang, list, opts) => `<div class="grid">${list.map((e) => card(lang, e, opts)).join("\n")}</div>`;
const searchForm = (lang, id) => `<form class="searchbar" action="${href(lang, "/a-z/")}" method="get" role="search">
  <label class="sr-only" for="${id}">${esc(T[lang].searchLabel)}</label>
  <input class="search" id="${id}" name="q" type="search" placeholder="${esc(T[lang].searchPlaceholder)}" autocomplete="off">
  <button class="btn primary" type="submit">${esc(T[lang].searchButton)}</button>
</form>`;
const newestFirst = [...entries].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.level - b.level || a.en.title.localeCompare(b.en.title)));
const inSubject = (s) => entries.filter((e) => e.subjects.includes(s));

function heroCard(lang, e, kicker) {
  const t = T[lang];
  return `<article class="hero" data-id="${e.id}">
  <div class="hero-copy">
    <p class="kicker">${esc(kicker)}</p>
    <h3 class="hero-title"><a href="${entryPath(lang, e)}">${esc(e[lang].title)}</a></h3>
    <p class="tagline">${esc(e[lang].tagline)}</p>
    <div class="meta">${lvl(lang, e.level)}${tags(lang, e)}</div>
    <p class="lead">${md(e[lang].explanation[0])}</p>
    <div class="hero-actions">
      <a class="btn primary" href="${entryPath(lang, e)}">${esc(t.read)} →</a>
      <button class="btn" type="button" data-learn="${e.id}" aria-pressed="false">${esc(t.markLearned)}</button>
    </div>
    <p class="hero-note mono"><span class="dot" aria-hidden="true"></span>${esc(t.todayNote)}</p>
  </div>
  <div class="hero-img"><img src="/content/${esc(e.image)}" alt="${esc(e.imageAlt[lang])}" width="400" height="240"></div>
</article>`;
}

// ---------- JSON-LD ----------
const orgLd = () => ({
  "@type": "Organization", "@id": `${SITE}/#legios`, name: ORG.name, url: ORG.url, sameAs: [ORG.url],
  description: "Legios is a small software studio from Rosario, Argentina, that builds open source tools. It makes Tidbit, a free bilingual dictionary of technology terms.",
  address: { "@type": "PostalAddress", addressLocality: ORG.city, addressRegion: ORG.region, addressCountry: ORG.country },
  contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: `${REPO}/issues`, availableLanguage: ["English", "Spanish"] },
});
const termSetLd = (lang) => ({ "@type": "DefinedTermSet", "@id": `${abs(href(lang, "/"))}#dictionary`, name: lang === "es" ? "Tidbit, el diccionario tech" : "Tidbit, the tech dictionary", url: abs(href(lang, "/")), inLanguage: lang });
const homeLd = (lang) => [{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE}/#website`, name: "Tidbit", url: abs(href(lang, "/")), description: T[lang].siteDescription, inLanguage: lang, publisher: { "@id": `${SITE}/#legios` },
      potentialAction: { "@type": "SearchAction", target: `${abs(href(lang, "/a-z/"))}?q={search_term_string}`, "query-input": "required name=search_term_string" } },
    orgLd(),
    { ...termSetLd(lang), description: T[lang].siteDescription, hasDefinedTerm: sortAlpha(lang, entries).map((e) => ({ "@type": "DefinedTerm", name: e[lang].title, url: abs(entryPath(lang, e)) })) },
  ],
}];
const crumbsLd = (lang, items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(p) })) });

// ---------- pages ----------
const pages = []; // { lang, p, html, md, noindex, lastmod }
const add = (o) => pages.push(o);

function homePage(lang) {
  const t = T[lang];
  const fallback = newestFirst[0];
  const starters = sortAlpha(lang, entries.filter((e) => e.level === 1)).filter((_, i) => i % 5 === 0).slice(0, 6);
  const subjectCards = Object.keys(subjects).map((s) => {
    const list = inSubject(s);
    return `<a class="subject" href="${href(lang, `/topics/${s}/`)}" data-ids="${list.map((e) => e.id).join(" ")}">
  <strong>${esc(subjLabel(lang, s))}</strong>
  <span class="muted">${esc(count(lang, list.length))}<span class="subject-progress"></span></span>
  <span class="bar"><span style="width:0%"></span></span>
</a>`;
  }).join("\n");
  const letters = [...new Set(sortAlpha(lang, entries).map((e) => letterOf(e[lang].title)))];
  const body = `<section class="dict-hero">
  <p class="kicker">${esc(t.heroKicker(entries.length))}</p>
  <h1>${esc(t.heroH1)}</h1>
  <p class="dict-lead">${esc(t.heroLead)}</p>
  ${searchForm(lang, "home-q")}
  <p class="popular"><span class="muted">${esc(t.popular)}:</span> ${starters.map((e) => `<a href="${entryPath(lang, e)}">${esc(e[lang].title)}</a>`).join(" · ")}</p>
</section>
<section aria-labelledby="today-h">
  <h2 id="today-h">${esc(t.todaysPick)}</h2>
  <div id="today-card">${heroCard(lang, fallback, `${t.new} · ${fmtDate(lang, fallback.date)}`)}</div>
</section>
<section id="earlier" hidden aria-labelledby="earlier-h">
  <h2 id="earlier-h">${esc(t.earlier)}</h2>
  <div class="grid" id="earlier-grid"></div>
</section>
<section aria-labelledby="subjects-h">
  <h2 id="subjects-h">${esc(t.bySubject)}</h2>
  <div class="subjects">${subjectCards}</div>
</section>
<section aria-labelledby="newest-h">
  <h2 id="newest-h">${esc(t.newest)}</h2>
  ${grid(lang, newestFirst.slice(0, 6))}
</section>
<section aria-labelledby="az-h">
  <h2 id="az-h">${esc(t.allTerms)}</h2>
  <nav class="letters" aria-label="${esc(t.letters)}">${letters.map((l) => `<a href="${href(lang, "/a-z/")}#letter-${l === "#" ? "0" : l.toLowerCase()}">${l}</a>`).join("")}</nav>
  <p class="more-link"><a class="btn" href="${href(lang, "/a-z/")}">${esc(t.seeAll)} →</a></p>
</section>`;
  const mdText = `# ${t.heroH1.replace(/\.$/, "")}

> ${t.siteDescription}

${t.heroLead}

- ${t.allTerms}: ${abs(href(lang, "/a-z/"))}
- ${t.topicsTitle}: ${abs(href(lang, "/topics/"))}
- ${lang === "es" ? "English version" : "Versión en castellano"}: ${abs(href(t.other, "/"))}
- ${lang === "es" ? "Para agentes" : "For agents"}: ${abs("/llms.txt")}

## ${t.bySubject}

${Object.keys(subjects).map((s) => `- [${subjLabel(lang, s)}](${abs(href(lang, `/topics/${s}/`))}): ${count(lang, inSubject(s).length)}`).join("\n")}

## ${t.newest}

${newestFirst.slice(0, 10).map((e) => `- [${e[lang].title}](${abs(entryPath(lang, e))}): ${e[lang].tagline}`).join("\n")}
`;
  add({ lang, p: "/", page: "home", lastmod: newestFirst[0].date,
    html: layout({ lang, p: "/", title: t.siteTitle, description: t.siteDescription, body, page: "home", jsonld: homeLd(lang) }), md: mdText });
}

function azPage(lang) {
  const t = T[lang];
  const sorted = sortAlpha(lang, entries);
  const groups = new Map();
  for (const e of sorted) {
    const l = letterOf(e[lang].title);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(e);
  }
  const anchor = (l) => `letter-${l === "#" ? "0" : l.toLowerCase()}`;
  const chips = Object.keys(subjects).map((s) => `<button class="chip" type="button" data-subject="${s}" aria-pressed="false">${esc(subjLabel(lang, s))}</button>`).join("");
  const levelChips = [1, 2, 3].map((n) => `<button class="chip lvlchip" type="button" data-level="${n}" aria-pressed="false">${esc(t.levels[n])}</button>`).join("");
  const haystack = (e) => [e.en.title, e.es.title, e.en.tagline, e.es.tagline, ...(e.aliases?.en ?? []), ...(e.aliases?.es ?? []), ...e.subjects.map((s) => subjLabel(lang, s))].join(" ").toLowerCase();
  const body = `<h1>${esc(t.azTitle)}</h1>
<p class="muted" id="count" aria-live="polite">${esc(count(lang, entries.length))}</p>
<div class="filters" id="filters" hidden>
  <label class="sr-only" for="q">${esc(t.searchLabel)}</label>
  <input class="search" id="q" type="search" placeholder="${esc(t.searchPlaceholder)}" autocomplete="off">
  <div class="chips" role="group" aria-label="${esc(t.topicsFilter)}">${chips}</div>
  <div class="chips" role="group" aria-label="${esc(t.level)}"><span class="muted chips-label">${esc(t.level)}:</span>${levelChips}<button class="chip ghost" type="button" data-clear hidden>${esc(t.clear)}</button></div>
  <label class="toggle"><input type="checkbox" id="onlyNew"> ${esc(t.onlyNew)}</label>
</div>
<nav class="letters" aria-label="${esc(t.letters)}">${[...groups.keys()].map((l) => `<a href="#${anchor(l)}">${l}</a>`).join("")}</nav>
${[...groups].map(([l, list]) => `<section class="letter" id="${anchor(l)}" aria-labelledby="${anchor(l)}-h">
  <h2 id="${anchor(l)}-h">${l}</h2>
  <ul class="az">
${list.map((e) => `    <li data-id="${e.id}" data-subjects="${e.subjects.join(" ")}" data-level="${e.level}" data-search="${esc(haystack(e))}"><a href="${entryPath(lang, e)}"><span class="az-title">${esc(e[lang].title)}</span><span class="az-tag">${esc(e[lang].tagline)}</span></a>${lvl(lang, e.level)}</li>`).join("\n")}
  </ul>
</section>`).join("\n")}
<p class="empty" id="az-empty" hidden>${esc(t.none)}</p>`;
  const mdText = `# ${t.azTitle}

${t.azDescription}

${[...groups].map(([l, list]) => `## ${l}\n\n${list.map((e) => `- [${e[lang].title}](${abs(entryPath(lang, e))}) (${t.levels[e.level]}): ${e[lang].tagline}`).join("\n")}`).join("\n\n")}
`;
  add({ lang, p: "/a-z/", page: "az", lastmod: newestFirst[0].date,
    html: layout({ lang, p: "/a-z/", title: `${t.azTitle} · Tidbit`, description: t.azDescription, body, page: "az",
      jsonld: [crumbsLd(lang, [["Tidbit", href(lang, "/")], [t.azTitle, href(lang, "/a-z/")]])] }), md: mdText });
}

function topicsPages(lang) {
  const t = T[lang];
  const cards = Object.keys(subjects).map((s) => `<a class="subject" href="${href(lang, `/topics/${s}/`)}" data-ids="${inSubject(s).map((e) => e.id).join(" ")}">
  <strong>${esc(subjLabel(lang, s))}</strong>
  <span class="muted">${esc(count(lang, inSubject(s).length))}<span class="subject-progress"></span></span>
  <span class="bar"><span style="width:0%"></span></span>
</a>`).join("\n");
  add({ lang, p: "/topics/", page: "topics", lastmod: newestFirst[0].date,
    html: layout({ lang, p: "/topics/", title: `${t.topicsTitle} · Tidbit`, description: t.topicsDescription, page: "topics",
      body: `<h1>${esc(t.topicsTitle)}</h1>\n<p class="dict-lead">${esc(t.topicsDescription)}</p>\n<div class="subjects">${cards}</div>`,
      jsonld: [crumbsLd(lang, [["Tidbit", href(lang, "/")], [t.topicsTitle, href(lang, "/topics/")]])] }),
    md: `# ${t.topicsTitle}\n\n${t.topicsDescription}\n\n${Object.keys(subjects).map((s) => `- [${subjLabel(lang, s)}](${abs(href(lang, `/topics/${s}/`))}): ${count(lang, inSubject(s).length)}`).join("\n")}\n` });

  for (const s of Object.keys(subjects)) {
    const label = subjLabel(lang, s);
    const list = inSubject(s);
    const byLevel = [1, 2, 3].map((n) => [n, sortAlpha(lang, list.filter((e) => e.level === n))]).filter(([, l]) => l.length);
    const p = `/topics/${s}/`;
    const lead = t.topicLead(label, list.length);
    add({ lang, p, page: "topics", lastmod: list.map((e) => e.date).sort().at(-1),
      html: layout({ lang, p, title: `${label} · ${t.topicsTitle} · Tidbit`, description: lead, page: "topics",
        body: `<nav class="crumbs" aria-label="breadcrumb"><a href="${href(lang, "/topics/")}">${esc(t.topicsTitle)}</a> / <span>${esc(label)}</span></nav>
<h1>${esc(label)}</h1>
<p class="dict-lead">${esc(lead)}</p>
${byLevel.map(([n, l]) => `<section aria-labelledby="lv${n}"><h2 id="lv${n}">${esc(t.levels[n])}</h2>${grid(lang, l)}</section>`).join("\n")}`,
        jsonld: [crumbsLd(lang, [["Tidbit", href(lang, "/")], [t.topicsTitle, href(lang, "/topics/")], [label, href(lang, p)]])] }),
      md: `# ${label}\n\n${lead}\n\n${byLevel.map(([n, l]) => `## ${t.levels[n]}\n\n${l.map((e) => `- [${e[lang].title}](${abs(entryPath(lang, e))}): ${e[lang].tagline}`).join("\n")}`).join("\n\n")}\n` });
  }
}

function learnedPage(lang) {
  const t = T[lang];
  add({ lang, p: "/learned/", page: "learned", noindex: true,
    html: layout({ lang, p: "/learned/", title: `${t.learnedTitle} · Tidbit`, description: t.footProgress, page: "learned", noindex: true, hasMarkdown: false,
      body: `<h1>${esc(t.learnedTitle)}</h1>
<p class="muted" id="learned-count">${esc(t.footProgress)}</p>
${grid(lang, sortAlpha(lang, entries), { hidden: true })}
<p class="empty" id="learned-empty">${esc(t.noneLearned)}</p>` }) });
}

function entryPages(lang) {
  const t = T[lang];
  const sorted = sortAlpha(lang, entries);
  for (const [i, e] of sorted.entries()) {
    const c = e[lang];
    const linked = new Map(); // each other term is linked once per entry, on its first mention
    const body = (s) => linkTerms(lang, md(s), e, linked);
    const explanation = c.explanation.map((x) => `<p>${body(x)}</p>`).join("\n");
    const analogy = body(c.analogy);
    const points = c.keyPoints.map((k) => `<li>${body(k)}</li>`).join("\n");
    const related = [...linked.values()].slice(0, 8);
    const more = sortAlpha(lang, entries.filter((x) => x.id !== e.id && x.subjects[0] === e.subjects[0] && !linked.has(x.id)))
      .sort((a, b) => Math.abs(a.level - e.level) - Math.abs(b.level - e.level)).slice(0, 3);
    const prev = sorted[i - 1], next = sorted[i + 1];
    const p = `/${e.slug}/`;
    const main = e.subjects[0];
    const html = `<article class="entry" lang="${lang}">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${href(lang, "/a-z/")}">${esc(t.back)}</a> / <a href="${href(lang, `/topics/${main}/`)}">${esc(subjLabel(lang, main))}</a></nav>
  <div class="meta entry-meta">${lvl(lang, e.level)}${tags(lang, e)}<span class="muted">${esc(t.published)} <time datetime="${e.date}">${esc(fmtDate(lang, e.date))}</time></span></div>
  <h1>${esc(c.title)}</h1>
  <p class="tagline">${esc(c.tagline)}</p>
  <figure class="entry-img"><img src="/content/${esc(e.image)}" alt="${esc(e.imageAlt[lang])}" width="400" height="240"></figure>
  <div class="prose">
${explanation}
  </div>
  <aside class="box" aria-labelledby="analogy-h"><h2 class="kicker" id="analogy-h">${esc(t.analogy)}</h2><p>${analogy}</p></aside>
  <h2>${esc(t.points)}</h2>
  <ul class="points">
${points}
  </ul>
  <h2>${esc(t.links)}</h2>
  <ul class="links">
${c.links.map((l) => `    <li><a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join("\n")}
  </ul>
${related.length ? `  <h2>${esc(t.related)}</h2>\n  <ul class="related">${related.map((x) => `<li><a href="${entryPath(lang, x)}">${esc(x[lang].title)}</a></li>`).join("")}</ul>` : ""}
  <div class="entry-foot">
    <button class="btn primary" type="button" data-learn="${e.id}" aria-pressed="false">${esc(t.markLearned)}</button>
    <nav class="pager" aria-label="${esc(t.letters)}">
      ${prev ? `<a class="btn" href="${entryPath(lang, prev)}" rel="prev">← ${esc(prev[lang].title)}</a>` : ""}
      ${next ? `<a class="btn" href="${entryPath(lang, next)}" rel="next">${esc(next[lang].title)} →</a>` : ""}
    </nav>
  </div>
</article>
${more.length ? `<section class="entry more" aria-labelledby="more-h"><h2 id="more-h">${esc(t.more)} ${esc(subjLabel(lang, main))}</h2>${grid(lang, more)}</section>` : ""}`;
    const ld = [{
      "@context": "https://schema.org", "@type": "DefinedTerm", "@id": `${abs(href(lang, p))}#term`,
      name: c.title, alternateName: e.aliases[lang].length ? e.aliases[lang] : undefined, description: c.tagline,
      url: abs(href(lang, p)), inLanguage: lang, image: abs(`/content/${e.image}`), datePublished: e.date,
      inDefinedTermSet: termSetLd(lang),
      subjectOf: { "@type": "Article", headline: c.title, description: c.tagline, inLanguage: lang, datePublished: e.date, publisher: { "@id": `${SITE}/#legios`, "@type": "Organization", name: ORG.name, url: ORG.url } },
    }, crumbsLd(lang, [["Tidbit", href(lang, "/")], [subjLabel(lang, main), href(lang, `/topics/${main}/`)], [c.title, href(lang, p)]])];
    add({ lang, p, page: "entry", lastmod: e.date,
      html: layout({ lang, p, title: `${c.title}: ${c.tagline.replace(/\.$/, "")} · Tidbit`, description: c.tagline, body: html, page: "entry", ogType: "article", jsonld: ld, extraConfig: { entryId: e.id } }),
      md: entryMarkdown(lang, e, related) });
  }
}

function entryMarkdown(lang, e, related = []) {
  const t = T[lang];
  const c = e[lang];
  const other = e[t.other];
  return `# ${c.title}

> ${c.tagline}

- ${t.md.level}: ${t.levels[e.level]}
- ${t.md.topics}: ${e.subjects.map((s) => subjLabel(lang, s)).join(", ")}
- ${t.md.url}: ${abs(entryPath(lang, e))}
- ${t.md.other}: [${other.title}](${abs(entryPath(t.other, e))})

${c.explanation.join("\n\n")}

## ${t.analogy}

${c.analogy}

## ${t.points}

${c.keyPoints.map((k) => `- ${k}`).join("\n")}

## ${t.links}

${c.links.map((l) => `- [${l.label}](${l.url})`).join("\n")}
${related.length ? `\n## ${t.related}\n\n${related.map((x) => `- [${x[lang].title}](${abs(entryPath(lang, x))}): ${x[lang].tagline}`).join("\n")}\n` : ""}`;
}

// ---------- trust pages ----------
const TRUST = {
  about: {
    en: { title: "About Tidbit", description: "What Tidbit is, who makes it and how the entries are written.", paras: [
      "Tidbit is a free dictionary of technology terms for curious people who are not engineers: a nurse, a lawyer, a student, a founder. They hear words like GPU, token, S3, HTTPS or Kubernetes and want to actually understand them in five minutes. Every term has a one-line definition, two to four short paragraphs, an everyday analogy, three or four points to remember, a hand-drawn style diagram and links to official documentation.",
      `Every entry is written in English and in Spanish as native pieces with the same content, not a literal translation. Terms have a level (basic, intermediate, advanced) and every technical term that has its own entry is linked wherever it appears, so you can follow a thread from the basics to the advanced topics. The dictionary covers ${Object.keys(subjects).map((s) => subjects[s].en).join(", ")}.`,
      "Tidbit is made by Legios, a small software studio from Rosario, Argentina, and it is open source under the MIT license. The content, the diagrams and the code live in a public GitHub repository, where anyone can suggest a new term, report a mistake or send a correction. Entries are checked against the official documentation they link to before they are published, and every external link is verified.",
      "There is no account and no tracking. To keep you coming back, the home page shows a different term every day you visit, and you can mark terms as learned; both live only in your own browser.",
    ] },
    es: { title: "Acerca de Tidbit", description: "Qué es Tidbit, quién lo hace y cómo se escriben las entradas.", paras: [
      "Tidbit es un diccionario gratis de términos de tecnología para gente curiosa que no es ingeniera: una enfermera, un abogado, una estudiante, un fundador. Escuchan palabras como GPU, token, S3, HTTPS o Kubernetes y quieren entenderlas de verdad en cinco minutos. Cada término tiene una definición de una línea, de dos a cuatro párrafos cortos, una analogía de todos los días, tres o cuatro puntos para recordar, un diagrama dibujado a mano y links a la documentación oficial.",
      `Cada entrada está escrita en castellano y en inglés como textos propios con el mismo contenido, no como una traducción literal. Los términos tienen un nivel (básico, intermedio, avanzado) y cada término técnico que tiene su propia entrada se enlaza donde aparezca, así podés seguir el hilo desde lo básico hasta lo avanzado. El diccionario cubre ${Object.keys(subjects).map((s) => subjects[s].es).join(", ")}.`,
      "Tidbit lo hace Legios, un pequeño estudio de software de Rosario, Argentina, y es código abierto con licencia MIT. El contenido, los diagramas y el código están en un repositorio público de GitHub, donde cualquiera puede sugerir un término nuevo, avisar de un error o mandar una corrección. Las entradas se contrastan con la documentación oficial que enlazan antes de publicarse, y cada link externo se verifica.",
      "No hay cuentas ni rastreo. Para que tengas ganas de volver, el inicio muestra un término distinto cada día que entrás, y podés marcar términos como aprendidos; las dos cosas viven solo en tu navegador.",
    ] },
  },
  contact: {
    en: { title: "Contact", description: "How to reach the people behind Tidbit, suggest a term or report a mistake.", paras: [
      `Tidbit is made by Legios, a small software studio based in Rosario, Santa Fe, Argentina. The best way to reach us is through the project's GitHub repository: open an issue at ${REPO}/issues to suggest a term, report a wrong or outdated definition, flag a broken link or ask a question. Issues are public, so please do not include private information in them.`,
      "If you found a mistake, tell us which term, what is wrong and, if you can, a source that shows the right answer: an official documentation page is ideal. Corrections are usually published within a few days. If you want to write an entry yourself, the repository explains the format, the voice and the rules for the diagrams; pull requests are welcome in English, Spanish or both.",
      `You can also find Legios and its other open source projects at ${ORG.url}. Tidbit has no sales team, no newsletter and no advertising; it is a free reference and it will stay that way.`,
    ] },
    es: { title: "Contacto", description: "Cómo llegar a quienes hacen Tidbit, sugerir un término o avisar de un error.", paras: [
      `Tidbit lo hace Legios, un pequeño estudio de software de Rosario, Santa Fe, Argentina. La mejor forma de contactarnos es el repositorio del proyecto en GitHub: abrí un issue en ${REPO}/issues para sugerir un término, avisar de una definición equivocada o desactualizada, señalar un link roto o hacer una pregunta. Los issues son públicos, así que no pongas información privada.`,
      "Si encontraste un error, contanos en qué término, qué está mal y, si podés, una fuente que muestre la respuesta correcta: lo ideal es una página de documentación oficial. Las correcciones suelen publicarse en pocos días. Si querés escribir una entrada, el repositorio explica el formato, el tono y las reglas de los diagramas; los pull requests son bienvenidos en castellano, en inglés o en los dos.",
      `También podés encontrar a Legios y sus otros proyectos de código abierto en ${ORG.url}. Tidbit no tiene equipo de ventas, newsletter ni publicidad; es una referencia gratis y va a seguir siéndolo.`,
    ] },
  },
  privacy: {
    en: { title: "Privacy", description: "What Tidbit stores, what it does not, and which third parties are involved.", paras: [
      "Tidbit has no accounts, no cookies, no analytics, no advertising and no tracking pixels. We do not collect your name, your email or anything about what you read. The only things the site remembers are stored by your own browser, in its local storage, on your device: the language you chose, the terms you marked as learned, the term the home page showed you on each day, and the filters you used in the A to Z list. They never leave your device, we cannot see them, and clearing your browser's site data deletes them.",
      "Two third parties are involved in serving the pages. The site is hosted on Cloudflare, which, like any web host, processes your IP address and request details to deliver the page and protect it from abuse. The fonts are loaded from Google Fonts, which means your browser asks Google's servers for the font files and Google receives your IP address with that request. Neither of them receives anything from Tidbit about you.",
      `The links at the end of each entry go to other sites, such as official documentation and Wikipedia, which have their own privacy policies. If you have a question about privacy, open an issue at ${REPO}/issues. This policy was last updated on ${TODAY}.`,
    ] },
    es: { title: "Privacidad", description: "Qué guarda Tidbit, qué no, y qué terceros intervienen.", paras: [
      "Tidbit no tiene cuentas, cookies, analíticas, publicidad ni píxeles de rastreo. No recolectamos tu nombre, tu email ni nada sobre lo que leés. Lo único que el sitio recuerda lo guarda tu propio navegador, en su almacenamiento local, en tu dispositivo: el idioma que elegiste, los términos que marcaste como aprendidos, el término que te mostró el inicio cada día y los filtros que usaste en la lista de la A a la Z. Nunca salen de tu dispositivo, no los podemos ver, y si borrás los datos del sitio en tu navegador desaparecen.",
      "Para servir las páginas intervienen dos terceros. El sitio está alojado en Cloudflare, que, como cualquier hosting, procesa tu dirección IP y los datos de la solicitud para entregar la página y protegerla de abusos. Las tipografías se cargan desde Google Fonts, así que tu navegador le pide los archivos a los servidores de Google y Google recibe tu dirección IP con ese pedido. Ninguno de los dos recibe de Tidbit nada sobre vos.",
      `Los links al final de cada entrada llevan a otros sitios, como documentación oficial y Wikipedia, que tienen sus propias políticas de privacidad. Si tenés una pregunta sobre privacidad, abrí un issue en ${REPO}/issues. Esta política se actualizó por última vez el ${TODAY}.`,
    ] },
  },
};
function trustPages(lang) {
  for (const [key, v] of Object.entries(TRUST)) {
    const c = v[lang];
    const p = `/${key}/`;
    const linkify = (s) => esc(s).replace(/https:\/\/[^\s,]+[^\s,.]/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);
    add({ lang, p, page: key, lastmod: TODAY,
      html: layout({ lang, p, title: `${c.title} · Tidbit`, description: c.description, page: key,
        jsonld: key === "about" ? [{ "@context": "https://schema.org", "@type": "AboutPage", url: abs(href(lang, p)), name: c.title, about: { "@id": `${SITE}/#website` }, publisher: orgLd() }]
          : key === "contact" ? [{ "@context": "https://schema.org", "@type": "ContactPage", url: abs(href(lang, p)), name: c.title, mainEntity: orgLd() }] : [],
        body: `<article class="entry page">\n<h1>${esc(c.title)}</h1>\n<div class="prose">${c.paras.map((x) => `<p>${linkify(x)}</p>`).join("\n")}</div>\n</article>` }),
      md: `# ${c.title}\n\n${c.paras.join("\n\n")}\n` });
  }
}

// ---------- developers ----------
function developersPage(lang) {
  const es = lang === "es";
  const sample = bySlug.get("data-lake") ?? entries[0];
  const blocks = [
    [es ? "Qué hay" : "What there is", es
      ? `Todo Tidbit se puede leer con código y sin cuenta: una API JSON estática, la versión Markdown de cada página y un servidor MCP para agentes de IA. Todo es de solo lectura, gratis y con CORS abierto. El contenido tiene licencia MIT: si lo mostrás, linkeá la entrada.`
      : `All of Tidbit is readable from code with no account: a static JSON API, a Markdown version of every page and an MCP server for AI agents. Everything is read-only, free and CORS-open. The content is MIT licensed: if you show it, link back to the entry.`, null],
    [es ? "API JSON" : "JSON API", es
      ? `${abs("/v1/terms.json")} lista todos los términos con su definición de una línea, alias, nivel, temas y URLs en los dos idiomas. ${abs("/v1/terms/<slug>.json")} trae la entrada completa. El esquema está en ${abs("/openapi.json")}.`
      : `${abs("/v1/terms.json")} lists every term with its one-line definition, aliases, level, topics and URLs in both languages. ${abs("/v1/terms/<slug>.json")} has the full entry. The schema is at ${abs("/openapi.json")}.`,
      `curl -s ${abs("/v1/terms.json")} | jq '.terms[] | {slug, title: .en.title}'\ncurl -s ${abs(`/v1/terms/${sample.slug}.json`)} | jq '.es.tagline'`],
    ["Markdown", es
      ? `Cualquier página devuelve Markdown si la pedís con Accept: text/markdown, o agregando index.md a su URL. Los 404 también responden en Markdown cuando lo pedís.`
      : `Any page returns Markdown when you ask with Accept: text/markdown, or when you add index.md to its URL. 404s answer in Markdown too when you ask for it.`,
      `curl -s -H 'Accept: text/markdown' ${abs(entryPath(lang, sample))}`],
    [es ? "Servidor MCP" : "MCP server", es
      ? `${abs("/mcp")} es un servidor MCP (Streamable HTTP, sin autenticación) con cuatro herramientas de solo lectura: search_terms, get_term, list_topic y term_of_the_day. Agregalo a cualquier cliente MCP con esta configuración. El server card está en ${abs("/.well-known/mcp/server-card.json")}.`
      : `${abs("/mcp")} is an MCP server (Streamable HTTP, no auth) with four read-only tools: search_terms, get_term, list_topic and term_of_the_day. Add it to any MCP client with this configuration. The server card is at ${abs("/.well-known/mcp/server-card.json")}.`,
      JSON.stringify({ mcpServers: { tidbit: { type: "http", url: abs("/mcp") } } }, null, 2)],
    [es ? "Errores" : "Errors", es
      ? `Los errores de la API y del servidor MCP son JSON. La API usa RFC 9457 (application/problem+json) con un code legible por máquinas (not_found, rate_limited, method_not_allowed), un mensaje y qué hacer después. MCP usa los errores de JSON-RPC.`
      : `API and MCP errors are JSON. The API uses RFC 9457 (application/problem+json) with a machine-readable code (not_found, rate_limited, method_not_allowed), a message and what to do next. MCP uses JSON-RPC errors.`,
      JSON.stringify({ type: abs("/developers/#errors"), title: "Term not found", status: 404, code: "not_found", detail: "No term has the slug 'foo'.", resolution: `List every term at ${abs("/v1/terms.json")}.` }, null, 2)],
    [es ? "Límites de uso" : "Rate limits", es
      ? `Uso justo: ${RATE.limit} pedidos cada ${RATE.window} segundos por cliente para /v1/ y /mcp, aplicado de forma aproximada. Cada respuesta trae los headers RateLimit-Policy y RateLimit; al pasarte recibís 429 con Retry-After. Para bajar todo de una vez, usá ${abs("/v1/terms.json")} o ${abs("/llms-full.txt")} en vez de pedir término por término.`
      : `Fair use: ${RATE.limit} requests per ${RATE.window} seconds per client on /v1/ and /mcp, enforced approximately. Every response carries RateLimit-Policy and RateLimit headers; going over returns 429 with Retry-After. To get everything at once, use ${abs("/v1/terms.json")} or ${abs("/llms-full.txt")} instead of fetching term by term.`, null],
    [es ? "Versiones" : "Versioning", es
      ? `La versión va en la ruta (/v1/). Dentro de una versión solo se agregan campos, nunca se sacan ni cambian de significado. Un cambio incompatible sale como /v2/, y /v1/ sigue funcionando al menos 12 meses después, avisado con los headers Deprecation y Sunset y en esta página.`
      : `The version is in the path (/v1/). Within a version fields are only added, never removed or changed in meaning. A breaking change ships as /v2/, and /v1/ keeps working for at least 12 months after that, announced with Deprecation and Sunset headers and on this page.`, null],
    [es ? "Ayuda" : "Help", es
      ? `Preguntas, errores o pedidos de términos: ${REPO}/issues. La guía para agentes está en ${abs("/llms.txt")}.`
      : `Questions, bugs or term requests: ${REPO}/issues. The guide for agents is at ${abs("/llms.txt")}.`, null],
  ];
  const ids = ["overview", "api", "markdown", "mcp", "errors", "rate-limits", "versioning", "help"];
  const title = es ? "Desarrolladores" : "Developers";
  const description = es ? "API JSON, Markdown y servidor MCP para usar el diccionario Tidbit desde código o desde agentes de IA." : "JSON API, Markdown and an MCP server to use the Tidbit dictionary from code or from AI agents.";
  const linkify = (x) => esc(x).replace(/https:\/\/[^\s,]+[^\s,.]/g, (u) => (u.includes("<") || u.includes("&lt;") ? u : `<a href="${u}">${u}</a>`));
  add({ lang, p: "/developers/", page: "developers", lastmod: TODAY,
    html: layout({ lang, p: "/developers/", title: `${title} · Tidbit`, description, page: "developers",
      jsonld: [{ "@context": "https://schema.org", "@type": "TechArticle", headline: title, description, url: abs(href(lang, "/developers/")), inLanguage: lang, publisher: { "@id": `${SITE}/#legios` } }],
      body: `<article class="entry page">\n<h1>${esc(title)}</h1>\n<p class="tagline">${esc(description)}</p>\n${blocks.map(([h, text, code], i) => `<section id="${ids[i]}"><h2>${esc(h)}</h2><p>${linkify(text)}</p>${code ? `<pre><code>${esc(code)}</code></pre>` : ""}</section>`).join("\n")}\n</article>` }),
    md: `# ${title}\n\n${description}\n\n${blocks.map(([h, text, code]) => `## ${h}\n\n${text}${code ? `\n\n\`\`\`\n${code}\n\`\`\`` : ""}`).join("\n\n")}\n` });
}

for (const lang of LANGS) { homePage(lang); azPage(lang); topicsPages(lang); learnedPage(lang); entryPages(lang); trustPages(lang); developersPage(lang); }

// ---------- 404 ----------
const notFoundHtml = layout({ lang: "en", p: "/404/", title: "Page not found · Tidbit", description: T.en.notFoundLead, page: "404", noindex: true, hasMarkdown: false,
  body: LANGS.map((lang) => `<section class="entry page" lang="${lang}">
  ${lang === "en" ? "<h1>" : "<h2>"}${esc(T[lang].notFoundTitle)}${lang === "en" ? "</h1>" : "</h2>"}
  <p>${esc(T[lang].notFoundLead)}</p>
  ${searchForm(lang, `nf-q-${lang}`)}
  <ul class="related"><li><a href="${href(lang, "/")}">${esc(T[lang].nav.home)}</a></li><li><a href="${href(lang, "/a-z/")}">${esc(T[lang].azTitle)}</a></li><li><a href="${href(lang, "/topics/")}">${esc(T[lang].topicsTitle)}</a></li><li><a href="/sitemap.xml">Sitemap</a></li><li><a href="/llms.txt">llms.txt</a></li></ul>
</section>`).join("\n") });
const notFoundMd = `# Page not found (404)

The page you asked for does not exist in Tidbit, the bilingual tech dictionary. It may have moved or the address may have a typo.

- Every term, A to Z: ${abs("/a-z/")} (Markdown: ${abs("/a-z/index.md")})
- Topics: ${abs("/topics/")}
- Guide for agents: ${abs("/llms.txt")}
- Sitemap: ${abs("/sitemap.xml")}
- Search terms programmatically: ${abs("/v1/terms.json")} or the MCP server at ${abs("/mcp")}

Term pages live at ${abs("/<term>/")} in English and ${abs("/es/<term>/")} in Spanish, for example ${abs(`/${(bySlug.get("api") ?? entries[0]).slug}/`)}.
`;

// ---------- agent and search files ----------
const apiTerm = (e) => ({
  id: e.id, slug: e.slug, date: e.date, level: e.level, subjects: e.subjects, image: abs(`/content/${e.image}`), caseSensitive: e.caseSensitive || undefined,
  ...Object.fromEntries(LANGS.map((lang) => [lang, {
    title: e[lang].title, tagline: e[lang].tagline, aliases: e.aliases[lang], imageAlt: e.imageAlt[lang], lead: e[lang].explanation[0],
    url: abs(entryPath(lang, e)), markdown: abs(`${entryPath(lang, e)}index.md`),
  }])),
});
const apiIndex = { name: "Tidbit", description: T.en.siteDescription, count: entries.length, generated: TODAY,
  subjects: Object.fromEntries(Object.entries(subjects).map(([id, s]) => [id, { en: s.en, es: s.es }])),
  terms: sortAlpha("en", entries).map(apiTerm) };

const llms = `# Tidbit

> ${T.en.siteDescription}

Tidbit is a free, open source dictionary of technology terms by Legios. ${entries.length} terms, each one in English and Spanish, written for people who are not engineers: a one-line definition, two to four short paragraphs, an everyday analogy, key points, a diagram and links to official sources.

## When to use Tidbit

Use Tidbit when a user who is not technical asks what a technology term means (for example "what is an API?", "qué es un data lake", "what does TSMC actually do?") and wants a short, plain-language explanation they can trust, in English or Spanish. It is a good source to quote or link when explaining AI, cloud computing, AWS services, networks, security, data, hardware or what big tech companies sell, and when you need the Spanish term for a concept. Each answer comes with an analogy and official links, so you can go deeper if the user asks.

Do not use Tidbit for code samples, API reference details, pricing, current news or legal and financial advice: it explains concepts, it does not document products.

## How to read it

- Every page is plain HTML that works without JavaScript. Send \`Accept: text/markdown\` to any page to get Markdown, or add \`index.md\` to its URL (for example ${abs(`/${(bySlug.get("api") ?? entries[0]).slug}/index.md`)}).
- Term pages: ${abs("/<term>/")} in English, ${abs("/es/<term>/")} in Spanish.
- JSON: ${abs("/v1/terms.json")} lists every term with its definition and URLs; ${abs("/v1/terms/<term>.json")} has the full entry. OpenAPI: ${abs("/openapi.json")}.
- MCP server (Streamable HTTP, no auth, read-only): ${abs("/mcp")} with tools \`search_terms\`, \`get_term\`, \`list_topic\` and \`term_of_the_day\`. Server card: ${abs("/.well-known/mcp/server-card.json")}.
- Full text of every entry: ${abs("/llms-full.txt")} (English) and ${abs("/es/llms-full.txt")} (Spanish).

## Main pages

- [Home](${abs("/")}) · [Inicio en castellano](${abs("/es/")})
- [All terms, A to Z](${abs("/a-z/")})
- [Topics](${abs("/topics/")})
- [Developers: JSON API, Markdown and MCP](${abs("/developers/")})
- [About](${abs("/about/")}) · [Contact](${abs("/contact/")}) · [Privacy](${abs("/privacy/")})
- [Source code](${REPO})

## Topics

${Object.keys(subjects).map((s) => `- [${subjects[s].en}](${abs(`/topics/${s}/`)}): ${count("en", inSubject(s).length)}`).join("\n")}

## Terms

${sortAlpha("en", entries).map((e) => `- [${e.en.title}](${abs(`/${e.slug}/index.md`)}): ${e.en.tagline}`).join("\n")}
`;
const llmsFull = (lang) => `# Tidbit · ${lang === "es" ? "todas las entradas" : "every entry"}\n\n> ${T[lang].siteDescription}\n\n${sortAlpha(lang, entries).map((e) => entryMarkdown(lang, e).replace(/^# /, "## ").replace(/\n## /g, "\n### ")).join("\n---\n\n")}`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.filter((x) => !x.noindex).map((x) => `  <url>
    <loc>${abs(href(x.lang, x.p))}</loc>
    <lastmod>${x.lastmod ?? TODAY}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${abs(href("en", x.p))}"/>
    <xhtml:link rel="alternate" hreflang="es" href="${abs(href("es", x.p))}"/>
  </url>`).join("\n")}
</urlset>
`;

const robots = `# Tidbit is a public dictionary: search engines and AI agents are welcome to read all of it.
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /
Disallow: /learned/

${["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bingbot"].map((ua) => `User-agent: ${ua}\nAllow: /`).join("\n\n")}

Sitemap: ${abs("/sitemap.xml")}
`;

const serverCard = {
  $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  name: "io.github.legiosai/tidbit",
  title: "Tidbit",
  description: "Look up plain-language definitions of technology terms (AI, cloud, AWS, networks, security, data, hardware, tech companies) in English and Spanish.",
  version: "1.0.0",
  websiteUrl: abs("/"),
  repository: { source: "github", url: REPO },
  remotes: [{ type: "streamable-http", url: abs("/mcp"), supportedProtocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26"] }],
};
const aiCatalog = { specVersion: "1.0", entries: [
  { identifier: "urn:air:tidbit.legios.com.ar:mcp:tidbit", type: "application/mcp-server-card+json", url: abs("/.well-known/mcp/server-card.json") },
  { identifier: "urn:air:tidbit.legios.com.ar:api:terms", type: "application/vnd.oai.openapi+json", url: abs("/openapi.json") },
  { identifier: "urn:air:tidbit.legios.com.ar:skill:tidbit", type: "text/markdown", url: abs("/skills/tidbit/SKILL.md") },
] };
const apiCatalog = { linkset: [{ anchor: abs("/v1/terms.json"),
  "service-desc": [{ href: abs("/openapi.json"), type: "application/vnd.oai.openapi+json" }],
  "service-doc": [{ href: abs("/llms.txt"), type: "text/plain" }] }] };
const problem = (description) => ({ description, headers: { RateLimit: { $ref: "#/components/headers/RateLimit" }, "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" } },
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } });
const localized = { type: "object", required: ["title", "tagline", "explanation", "analogy", "keyPoints", "links"], properties: {
  title: { type: "string" }, tagline: { type: "string", description: "One-line definition" },
  explanation: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4, description: "Paragraphs with **bold** and `code` inline markup" },
  analogy: { type: "string" }, keyPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
  links: { type: "array", items: { type: "object", required: ["label", "url"], properties: { label: { type: "string" }, url: { type: "string", format: "uri" } } } } } };
const openapi = {
  openapi: "3.1.0",
  info: { title: "Tidbit API", version: "1.0.0",
    description: `Read-only JSON for the Tidbit tech dictionary: static files, no auth, CORS open. The version is in the path (/v1/). Fields are only added within a version; a breaking change ships as /v2/ and /v1/ keeps working for at least 12 months after it, announced with Deprecation and Sunset headers and in ${SITE}/developers/. Errors are RFC 9457 problem+json. Fair use: ${RATE.limit} requests per ${RATE.window} seconds per client, announced in RateLimit headers.`,
    license: { name: "MIT", url: `${REPO}/blob/main/LICENSE` }, contact: { name: "Legios", url: `${REPO}/issues` } },
  externalDocs: { description: "Developer guide", url: abs("/developers/") },
  servers: [{ url: SITE }],
  paths: {
    "/v1/terms.json": { get: { operationId: "listTerms", summary: "List every term", description: "Every term with its one-line definition, aliases, level, topics and URLs, in English and Spanish.",
      responses: { 200: { description: "The term list", headers: { RateLimit: { $ref: "#/components/headers/RateLimit" } }, content: { "application/json": { schema: { $ref: "#/components/schemas/TermList" } } } }, 429: problem("Too many requests; wait Retry-After seconds") } } },
    "/v1/terms/{slug}.json": { get: { operationId: "getTerm", summary: "Get one term", description: "The full entry for one term: explanation, analogy, key points and links in both languages.",
      parameters: [{ name: "slug", in: "path", required: true, description: "The term's slug, as in its URL", schema: { type: "string", pattern: "^[a-z0-9-]+$", example: "data-lake" } }],
      responses: { 200: { description: "The entry", headers: { RateLimit: { $ref: "#/components/headers/RateLimit" } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Entry" } } } },
        404: problem("No term with that slug"), 429: problem("Too many requests; wait Retry-After seconds") } } },
  },
  components: {
    headers: {
      RateLimit: { description: "Remaining quota in the current window (draft-ietf-httpapi-ratelimit-headers)", schema: { type: "string", example: `"fair";r=${RATE.limit - 1};t=${RATE.window}` } },
      RateLimitPolicy: { description: "The quota policy", schema: { type: "string", example: `"fair";q=${RATE.limit};w=${RATE.window}` } },
    },
    schemas: {
      Problem: { type: "object", description: "RFC 9457 problem details", required: ["type", "title", "status", "code"], properties: {
        type: { type: "string", format: "uri" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" }, instance: { type: "string" },
        code: { type: "string", enum: ["not_found", "rate_limited", "method_not_allowed"], description: "Machine-readable error code" },
        resolution: { type: "string", description: "What to do next" }, documentation_url: { type: "string", format: "uri" } } },
      LocalizedSummary: { type: "object", required: ["title", "tagline", "aliases", "lead", "url", "markdown"], properties: {
        title: { type: "string" }, tagline: { type: "string" }, aliases: { type: "array", items: { type: "string" } }, imageAlt: { type: "string" },
        lead: { type: "string", description: "First paragraph of the explanation" }, url: { type: "string", format: "uri" }, markdown: { type: "string", format: "uri" } } },
      Term: { type: "object", required: ["id", "slug", "date", "level", "subjects", "en", "es"], properties: {
        id: { type: "string" }, slug: { type: "string" }, date: { type: "string", format: "date" }, level: { type: "integer", enum: [1, 2, 3], description: "1 basic, 2 intermediate, 3 advanced" },
        subjects: { type: "array", items: { type: "string", enum: Object.keys(subjects) } }, image: { type: "string", format: "uri" },
        en: { $ref: "#/components/schemas/LocalizedSummary" }, es: { $ref: "#/components/schemas/LocalizedSummary" } } },
      TermList: { type: "object", required: ["count", "terms"], properties: { name: { type: "string" }, count: { type: "integer" }, generated: { type: "string", format: "date" },
        subjects: { type: "object", additionalProperties: { type: "object", properties: { en: { type: "string" }, es: { type: "string" } } } },
        terms: { type: "array", items: { $ref: "#/components/schemas/Term" } } } },
      Entry: { type: "object", required: ["id", "slug", "date", "level", "subjects", "aliases", "en", "es", "urls"], properties: {
        id: { type: "string" }, slug: { type: "string" }, date: { type: "string", format: "date" }, level: { type: "integer", enum: [1, 2, 3] },
        subjects: { type: "array", items: { type: "string", enum: Object.keys(subjects) } }, image: { type: "string" },
        aliases: { type: "object", properties: { en: { type: "array", items: { type: "string" } }, es: { type: "array", items: { type: "string" } } } },
        en: localized, es: localized,
        urls: { type: "object", properties: { en: { type: "string", format: "uri" }, es: { type: "string", format: "uri" } } } } },
    },
  },
};
const skill = `---
name: tidbit
description: Explain a technology term in plain language, in English or Spanish, using the Tidbit dictionary. Use when a non-technical user asks what a tech term means (API, token, data lake, VPN, Kubernetes, TSMC…).
---

# Tidbit: look up a tech term

1. Search: fetch ${abs("/v1/terms.json")} and match the user's words against \`en.title\`, \`es.title\` and the \`aliases\` (or call the MCP tool \`search_terms\` at ${abs("/mcp")}).
2. Read: fetch the entry's \`markdown\` URL (or \`get_term\`). It has the definition, the explanation, an analogy, key points and official links.
3. Answer in the user's language with the tagline first, then the analogy, and link the entry's \`url\` so they can read more.

Every term has a level: 1 basic, 2 intermediate, 3 advanced. For a beginner, prefer explaining the level 1 terms an advanced entry links to.
`;

// ---------- write ----------
await rm(out, { recursive: true, force: true });
const write = async (rel, data) => {
  const f = path.join(out, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, data);
};
for (const x of pages) {
  const dir = href(x.lang, x.p).replace(/^\//, "");
  await write(path.join(dir, "index.html"), x.html);
  if (x.md) await write(path.join(dir, "index.md"), x.md);
}
await write("404.html", notFoundHtml);
await write("404.md", notFoundMd);
await write("llms.txt", llms);
await write("llms-full.txt", llmsFull("en"));
await write("es/llms-full.txt", llmsFull("es"));
await write("sitemap.xml", sitemap);
await write("robots.txt", robots);
await write("v1/terms.json", JSON.stringify(apiIndex));
for (const e of entries) await write(`v1/terms/${e.slug}.json`, JSON.stringify({ ...e, urls: Object.fromEntries(LANGS.map((l) => [l, abs(entryPath(l, e))])) }));
await write("openapi.json", JSON.stringify(openapi, null, 2));
await write(".well-known/mcp/server-card.json", JSON.stringify(serverCard, null, 2));
await write(".well-known/mcp.json", JSON.stringify(serverCard, null, 2));
await write("mcp/server-card.json", JSON.stringify(serverCard, null, 2));
await write(".well-known/ai-catalog.json", JSON.stringify(aiCatalog, null, 2));
await write(".well-known/api-catalog", JSON.stringify(apiCatalog, null, 2));
await write("skills/tidbit/SKILL.md", skill);
await write(".well-known/agent-skills/index.json", JSON.stringify({ skills: [{ name: "tidbit", description: "Explain a technology term in plain language using the Tidbit dictionary.", url: abs("/skills/tidbit/SKILL.md"), sha256: createHash("sha256").update(skill).digest("hex") }] }, null, 2));
for (const f of ["app.js", "style.css", "favicon.svg"]) await cp(path.join(root, f), path.join(out, f));
await cp(path.join(root, "assets"), out, { recursive: true });
await cp(path.join(root, "content", "img"), path.join(out, "content", "img"), { recursive: true });
await cp(path.join(root, "site"), out, { recursive: true }); // _worker.js, _routes.json, _headers

console.log(`dist: ${pages.length} pages (${entries.length} terms × ${LANGS.length} languages) for ${SITE}`);
