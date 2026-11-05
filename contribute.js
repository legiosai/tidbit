/* The /contribute/ form. It turns what the visitor types into an entry in the format of content/entries/*.json,
   checks it with the same rules the build uses (/entry-rules.js is scripts/entry-rules.mjs), shows a preview, and
   hands the result to GitHub as an issue. Nothing is sent from this page; the draft lives in this browser's
   localStorage until the visitor starts over. */
import { LANGS, SVG_START, SVG_BACKGROUND, validateContribution } from "/entry-rules.js";

const cfg = JSON.parse(document.getElementById("tb-config").textContent);
const C = cfg.contribute;
const S = C.strings;
const form = document.getElementById("contribute");
const $ = (id) => document.getElementById(id);
const DRAFT_KEY = "tidbit.contribution";
const MAX_URL = 7500; // GitHub refuses much longer links

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\+\+/g, "pp").replace(/#/g, "sharp")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const paragraphs = (s) => s.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

const TEMPLATE = `${SVG_START}
  ${SVG_BACKGROUND}
  <rect x="40" y="80" width="120" height="80" rx="12" fill="#9ac7ea" stroke="#2b2b2b" stroke-width="2"/>
  <text x="100" y="125" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="#2b2b2b">thing</text>
  <line x1="160" y1="120" x2="240" y2="120" stroke="#2b2b2b" stroke-width="2"/>
  <path d="M232 114 L242 120 L232 126" fill="none" stroke="#2b2b2b" stroke-width="2"/>
  <rect x="240" y="80" width="120" height="80" rx="12" fill="#ffd166" stroke="#2b2b2b" stroke-width="2"/>
  <text x="300" y="125" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="#2b2b2b">result</text>
  <text x="200" y="210" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle" fill="#6b6357">a short caption</text>
</svg>`;


// The rules speak in field names (en.tagline); the visitor reads them in words, in the page's language.
const LNAME = { en: { en: "English", es: "Spanish" }, es: { en: "inglés", es: "castellano" } }[cfg.lang];
const FNAME = {
  en: { title: "title", tagline: "one-line definition", explanation: "explanation", analogy: "analogy", keyPoints: "key points", links: "sources", imageAlt: "image description", aliases: "other names" },
  es: { title: "el título", tagline: "la definición de una línea", explanation: "la explicación", analogy: "la analogía", keyPoints: "los puntos clave", links: "las fuentes", imageAlt: "la descripción de la imagen", aliases: "los otros nombres" },
}[cfg.lang];
const ES = [
  [/^slug must be ascii kebab-case, like "data-lake" \(got "(.*)"\)$/, (m) => `La URL va en minúsculas ascii con guiones, como "data-lake" (ahora: "${m[1]}").`],
  [/^subjects must have 1 or 2 ids$/, () => "Elegí 1 o 2 temas."],
  [/^subjects repeats a topic$/, () => "El segundo tema repite el primero."],
  [/^level must be 1, 2 or 3/, () => "Elegí un nivel."],
  [/^imageAlt\.(en|es) missing$/, (m) => `Falta la descripción de la imagen en ${LNAME[m[1]]}.`],
  [/^(en|es)\.(\w+) missing$/, (m) => `Falta ${FNAME[m[2]] ?? m[2]} en ${LNAME[m[1]]}.`],
  [/^(en|es)\.tagline is (\d+) chars, keep it under 90$/, (m) => `La definición en ${LNAME[m[1]]} tiene ${m[2]} caracteres: dejala en menos de 90.`],
  [/^(en|es)\.explanation needs 2 to 4 paragraphs$/, (m) => `La explicación en ${LNAME[m[1]]} necesita de 2 a 4 párrafos, separados por una línea en blanco.`],
  [/^(en|es)\.keyPoints needs 3 or 4 items$/, (m) => `Los puntos clave en ${LNAME[m[1]]} tienen que ser 3 o 4, uno por línea.`],
  [/^(en|es)\.links needs (?:1 to 3 items|2 or 3 sources)$/, (m) => `Las fuentes en ${LNAME[m[1]]} tienen que ser 2 o 3, una por línea: Nombre | https://…`],
  [/^(en|es): bad link (.*)$/, (m) => `Hay una fuente mal escrita en ${LNAME[m[1]]}: ${m[2]}. Cada línea es Nombre | https://…`],
  [/^(en|es): HTML is not allowed in text/, (m) => `No se puede usar HTML en el texto en ${LNAME[m[1]]}; si es código, ponelo entre \`comillas invertidas\`.`],
  [/^(en|es)\.([\w \[\]\d]+) is (\d+) characters, the limit is (\d+)$/, (m) => `${m[2]} en ${LNAME[m[1]]}: ${m[3]} caracteres, el máximo es ${m[4]}.`],
  [/^(en|es)\.title should be 1 to 4 words$/, (m) => `El título en ${LNAME[m[1]]} tiene que tener de 1 a 4 palabras.`],
  [/^(en|es): titles, taglines and key points are one line each$/, (m) => `En ${LNAME[m[1]]}, el título, la definición y cada punto clave van en una sola línea.`],
  [/^aliases\.(en|es) has (\d+) items, the limit is (\d+)$/, (m) => `Hay ${m[2]} otros nombres en ${LNAME[m[1]]}; el máximo es ${m[3]}.`],
  [/^(en|es) "(.*)" already belongs to "(.*)"; link to that entry instead, or pick another word$/, (m) => `"${m[2]}" (${LNAME[m[1]]}) ya es de la entrada "${m[3]}": mencionala en el texto o elegí otra palabra.`],
  [/^(en|es) "(.*)" is listed twice$/, (m) => `"${m[2]}" aparece dos veces en ${LNAME[m[1]]}.`],
  [/^(en|es) alias "(.*)" repeats the title/, (m) => `"${m[2]}" es el título; sacalo de los otros nombres en ${LNAME[m[1]]}.`],
  [/^(en|es) alias "(.*)" is too short to link$/, (m) => `"${m[2]}" es demasiado corto para ser otro nombre.`],
  [/^there is already an entry at \/(.*)\/;/, (m) => `Ya hay una entrada en /${m[1]}/; si querés cambiarla, abrí un issue sobre esa entrada.`],
  [/^(en|es): links cannot carry a user or password$/, (m) => `Las fuentes en ${LNAME[m[1]]} no pueden llevar usuario ni contraseña.`],
  [/^the illustration is missing$/, () => "Falta la ilustración."],
  [/^image needs viewBox/, () => 'La ilustración necesita viewBox="0 0 400 240" (usá la plantilla).'],
  [/^the first element must be the background/, () => "Lo primero dentro del SVG tiene que ser el fondo de la plantilla."],
  [/^image uses colors outside the palette: (.*)$/, (m) => `La ilustración usa colores fuera de la paleta: ${m[1]}.`],
  [/^image uses <(.*)>; only basic shapes/, (m) => `La ilustración usa <${m[1]}>; solo se permiten formas simples, texto y grupos.`],
  [/^image is (\d+) chars, keep it under 6000$/, (m) => `La ilustración tiene ${m[1]} caracteres; el máximo es 6000.`],
  [/^image is not valid XML: (.*)$/, (m) => `El SVG no es XML válido: ${m[1]}.`],
  [/^image contains (a forbidden element|an active attribute)$/, () => "La ilustración tiene algo que no está permitido (scripts, links, imágenes externas o eventos)."],
];
const EN = [
  [/^imageAlt\.(en|es) missing$/, (m) => `The image description in ${LNAME[m[1]]} is missing.`],
  [/^(en|es)\.(\w+) missing$/, (m) => `The ${FNAME[m[2]] ?? m[2]} in ${LNAME[m[1]]} is missing.`],
  [/^(en|es)\.explanation needs 2 to 4 paragraphs$/, (m) => `The explanation in ${LNAME[m[1]]} needs 2 to 4 paragraphs, separated by a blank line.`],
  [/^(en|es)\.keyPoints needs 3 or 4 items$/, (m) => `The key points in ${LNAME[m[1]]} must be 3 or 4, one per line.`],
  [/^(en|es)\.links needs (?:1 to 3 items|2 or 3 sources)$/, (m) => `The sources in ${LNAME[m[1]]} must be 2 or 3, one per line: Label | https://…`],
];
function friendly(p) {
  for (const [re, fn] of cfg.lang === "es" ? ES : EN) { const m = p.match(re); if (m) return fn(m); }
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ---------- the draft ----------
const FIELDS = ["subject", "subject2", "slug", "svg", ...LANGS.flatMap((L) => ["title", "tagline", "explanation", "analogy", "keyPoints", "links", "aliases", "imageAlt"].map((k) => `${L}-${k}`))];

function readForm() {
  const v = (id) => $(id).value;
  const subjects = [v("subject"), v("subject2")].filter(Boolean);
  const draft = {
    slug: v("slug").trim(),
    subjects: [...new Set(subjects)],
    level: Number(form.querySelector('input[name="level"]:checked')?.value ?? 1),
  };
  if ($("caseSensitive").checked) draft.caseSensitive = true;
  draft.aliases = Object.fromEntries(LANGS.map((L) => [L, v(`${L}-aliases`).split(",").map((x) => x.trim()).filter(Boolean)]));
  draft.imageAlt = Object.fromEntries(LANGS.map((L) => [L, v(`${L}-imageAlt`).trim()]));
  for (const L of LANGS) {
    draft[L] = {
      title: v(`${L}-title`).trim(),
      tagline: v(`${L}-tagline`).trim(),
      explanation: paragraphs(v(`${L}-explanation`)),
      analogy: paragraphs(v(`${L}-analogy`)).join(" "),
      keyPoints: lines(v(`${L}-keyPoints`)),
      links: lines(v(`${L}-links`)).map((line) => {
        const at = line.lastIndexOf("|");
        return at < 0 ? { label: "", url: line } : { label: line.slice(0, at).trim(), url: line.slice(at + 1).trim() };
      }),
    };
  }
  return { draft, svg: v("svg").trim() };
}

function saveDraft() {
  const raw = Object.fromEntries(FIELDS.map((id) => [id, $(id).value]));
  raw.level = form.querySelector('input[name="level"]:checked')?.value;
  raw.caseSensitive = $("caseSensitive").checked;
  raw.slugTouched = $("slug").dataset.touched === "1";
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(raw)); } catch { /* private mode */ }
}
function loadDraft() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { /* ignore */ }
  if (!raw) { $("svg").value = TEMPLATE; return false; }
  for (const id of FIELDS) if (typeof raw[id] === "string") $(id).value = raw[id];
  const lvl = form.querySelector(`input[name="level"][value="${raw.level}"]`);
  if (lvl) lvl.checked = true;
  $("caseSensitive").checked = !!raw.caseSensitive;
  if (raw.slugTouched) $("slug").dataset.touched = "1";
  return true;
}

// ---------- the existing terms, for the duplicate check ----------
let existing = [];
let termsState = "loading";
fetch("/v1/terms.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((api) => {
  existing = api.terms.map((x) => ({ id: x.id, title: { en: x.en.title, es: x.es.title }, aliases: { en: x.en.aliases, es: x.es.aliases } }));
  termsState = "ready";
  update();
}).catch(() => { termsState = "failed"; update(); });

// ---------- check, preview, send ----------
let current = null;
let previewLang = cfg.lang;
let svgUrl = null;

function update() {
  const { draft, svg } = readForm();
  const problems = validateContribution(draft, { subjects: C.subjects, svg, existing, today: today() });
  current = { draft, svg, problems };

  const status = $("cf-status");
  status.className = `cf-status ${problems.length ? "bad" : "good"}`;
  status.textContent = problems.length ? S.problems : S.ok;
  $("cf-problems").innerHTML = [...new Set(problems.map(friendly))].map((p) => `<li>${esc(p)}</li>`).join("")
    + (termsState === "loading" ? `<li class="muted">${esc(S.loadingTerms)}</li>` : termsState === "failed" ? `<li class="muted">${esc(S.termsFailed)}</li>` : "");
  $("cf-send").disabled = problems.length > 0;

  for (const el of form.querySelectorAll("[data-count]")) {
    const max = Number(el.dataset.count);
    el.classList.toggle("over", el.value.trim().length > max);
    el.setAttribute("aria-invalid", String(el.value.trim().length > max));
  }

  // An <img> never runs scripts inside an SVG, so the visitor's drawing is safe to show as it is.
  if (svgUrl) URL.revokeObjectURL(svgUrl);
  svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  $("svg-preview").src = svgUrl;
  renderPreview();
}

function renderPreview() {
  const { draft } = current;
  const L = previewLang;
  const c = draft[L];
  const levels = C.levels;
  const subj = draft.subjects.map((s) => C.subjects[s]?.[L] ?? s).join(" · ");
  $("cf-preview").innerHTML = `<article class="entry" lang="${L}">
  <div class="meta entry-meta"><span class="muted">${esc(levels[draft.level] ?? "")}${subj ? ` · ${esc(subj)}` : ""}</span></div>
  <h1>${esc(c.title || "…")}</h1>
  <p class="tagline">${esc(c.tagline || "…")}</p>
  <figure class="entry-img"><img src="${svgUrl}" alt="${esc(draft.imageAlt[L])}" width="400" height="240"></figure>
  <div class="prose">${c.explanation.map((p) => `<p>${md(p)}</p>`).join("")}</div>
  ${c.analogy ? `<aside class="box"><h2 class="kicker">${esc(C.analogy)}</h2><p>${md(c.analogy)}</p></aside>` : ""}
  ${c.keyPoints.length ? `<h2>${esc(C.points)}</h2><ul class="points">${c.keyPoints.map((k) => `<li>${md(k)}</li>`).join("")}</ul>` : ""}
  ${c.links.length ? `<h2>${esc(C.links)}</h2><ul class="links">${c.links.map((l) => (/^https:\/\//.test(l.url) ? `<li><a href="${esc(l.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(l.label || l.url)}</a></li>` : `<li>${esc(l.label)} ${esc(l.url)}</li>`)).join("")}</ul>` : ""}
</article>`;
}

// What goes to GitHub: the entry (without date or id, which are set when it is accepted) and its illustration.
function payload() {
  const { draft, svg } = current;
  return JSON.stringify({ ...draft, svg }, null, 2);
}
function issueBody(json) {
  return "```json\n" + json + "\n```";
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

$("cf-send").addEventListener("click", async () => {
  update();
  if (current.problems.length) return;
  const json = payload();
  const base = `${C.repo}/issues/new?template=${encodeURIComponent(C.issueTemplate)}&title=${encodeURIComponent(`New term: ${current.draft.en.title} / ${current.draft.es.title}`)}`;
  const full = `${base}&submission=${encodeURIComponent(issueBody(json))}`;
  if (full.length <= MAX_URL) {
    window.open(full, "_blank", "noopener");
    $("cf-note").textContent = "";
  } else {
    await copy(issueBody(json));
    window.open(base, "_blank", "noopener");
    $("cf-note").textContent = S.tooLong;
  }
});
$("cf-copy").addEventListener("click", async () => {
  update();
  $("cf-note").textContent = (await copy(issueBody(payload()))) ? S.copied : "";
});
$("cf-download").addEventListener("click", () => {
  update();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([payload() + "\n"], { type: "application/json" }));
  a.download = `${current.draft.slug || "tidbit-entry"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("cf-reset").addEventListener("click", () => {
  if (!window.confirm(S.confirmReset)) return;
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  form.reset();
  delete $("slug").dataset.touched;
  $("svg").value = TEMPLATE;
  $("cf-note").textContent = "";
  update();
});
$("svg-template").addEventListener("click", () => { $("svg").value = TEMPLATE; saveDraft(); update(); });
for (const b of form.querySelectorAll("[data-preview]")) {
  b.addEventListener("click", () => {
    previewLang = b.dataset.preview;
    for (const x of form.querySelectorAll("[data-preview]")) { const on = x === b; x.setAttribute("aria-selected", String(on)); x.setAttribute("aria-pressed", String(on)); }
    renderPreview();
  });
}

// The URL follows the English title until the visitor edits it.
$("slug").addEventListener("input", () => { $("slug").dataset.touched = "1"; });
$("en-title").addEventListener("input", () => { if ($("slug").dataset.touched !== "1") $("slug").value = slugify($("en-title").value); });

let timer = 0;
form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { saveDraft(); update(); }, 200); });
form.addEventListener("change", () => { saveDraft(); update(); });
form.addEventListener("submit", (ev) => ev.preventDefault());

if (loadDraft()) $("cf-note").textContent = S.saved;
form.hidden = false;
update();
