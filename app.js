/* Tidbit in the browser. Every page arrives fully rendered from scripts/build-site.mjs; this script only adds what
   depends on the visitor: the term of the day, "learned" marks and progress, the A–Z filters and the language choice.
   All of it lives in this browser's localStorage, nothing is sent anywhere. */
(() => {
  "use strict";

  const STORE = { lang: "tidbit.lang", learned: "tidbit.learned", filters: "tidbit.filters", days: "tidbit.days" };
  const cfg = JSON.parse(document.getElementById("tb-config").textContent);
  const S = cfg.strings;
  const lang = cfg.lang;
  const base = lang === "es" ? "/es" : "";

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const count = (n) => fmt(n === 1 ? S.count1 : S.countN, { n });
  const todayISO = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(S.locale, { day: "numeric", month: "long", year: "numeric" });

  // ---------- old URLs and the language choice ----------
  // The first version of the site lived on hash routes (#/e/<id>, #/all, #/learned).
  const hash = location.hash;
  if (hash.startsWith("#/e/")) { location.replace(`${base}/${decodeURIComponent(hash.slice(4)).slice(11)}/`); return; }
  if (hash === "#/all") { location.replace(`${base}/a-z/`); return; }
  if (hash === "#/learned") { location.replace(`${base}/learned/`); return; }
  // Arriving at the English home from outside with Spanish preferred (chosen before, or the browser's language): go to /es/.
  const preferred = load(STORE.lang, (navigator.languages?.[0] || navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
  if (location.pathname === "/" && lang === "en" && preferred === "es" && !document.referrer.startsWith(location.origin)) { location.replace("/es/"); return; }
  document.querySelectorAll("[data-lang-switch]").forEach((a) => a.addEventListener("click", () => save(STORE.lang, a.dataset.langSwitch)));

  // ---------- learned ----------
  const learned = new Set(load(STORE.learned, []));
  function paintLearned() {
    document.querySelectorAll("[data-id]").forEach((el) => el.classList.toggle("learned", learned.has(el.dataset.id)));
    document.querySelectorAll("[data-learn]").forEach((b) => {
      const on = learned.has(b.dataset.learn);
      b.dataset.primary ??= String(b.classList.contains("primary")); // remember the button's own style
      b.textContent = on ? S.learned : S.markLearned;
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("done", on);
      b.classList.toggle("primary", !on && b.dataset.primary === "true");
    });
    const progress = document.getElementById("progress");
    if (progress) progress.textContent = fmt(S.progress, { a: learned.size, b: cfg.total });
    document.querySelectorAll(".subject[data-ids]").forEach((el) => {
      const ids = el.dataset.ids.split(" ").filter(Boolean);
      const done = ids.filter((id) => learned.has(id)).length;
      el.querySelector(".bar span").style.width = `${ids.length ? Math.round((done / ids.length) * 100) : 0}%`;
      el.querySelector(".subject-progress").textContent = done ? ` · ${fmt(S.progress, { a: done, b: ids.length })}` : "";
    });
    if (cfg.page === "learned") paintLearnedPage();
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-learn]");
    if (!b) return;
    const id = b.dataset.learn;
    if (learned.has(id)) learned.delete(id); else learned.add(id);
    save(STORE.learned, [...learned]);
    paintLearned();
  });

  function paintLearnedPage() {
    let n = 0;
    document.querySelectorAll(".grid .card[data-id]").forEach((c) => { const on = learned.has(c.dataset.id); c.hidden = !on; if (on) n++; });
    document.getElementById("learned-empty").hidden = n > 0;
    document.getElementById("learned-count").textContent = fmt(S.progress, { a: n, b: cfg.total });
  }

  // ---------- term of the day ----------
  // One term per calendar day, per browser. The first visit of a day picks a term this browser was never shown
  // (unlearned first, lowest level first, so basics come before what builds on them) and remembers it, so the
  // rest of the day keeps the same one even after marking it learned. Once every term was shown, the least
  // recently shown comes back, so nothing repeats before a full round.
  function normalizeDays(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    return Object.fromEntries(Object.entries(d).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "string"));
  }
  function pickOfTheDay(list, days) {
    const today = todayISO();
    const byId = new Map(list.map((e) => [e.id, e]));
    const kept = byId.get(days[today]);
    if (kept) return kept;
    const lastShown = new Map();
    for (const [d, id] of Object.entries(days)) if (d < today && !(lastShown.get(id) > d)) lastShown.set(id, d);
    const never = list.filter((e) => !lastShown.has(e.id));
    const unlearned = never.filter((e) => !learned.has(e.id));
    let pool = unlearned.length ? unlearned : never;
    if (pool.length) {
      const minLevel = Math.min(...pool.map((e) => e.level));
      pool = pool.filter((e) => e.level === minLevel);
    } else {
      const oldest = Math.min(...list.map((e) => Date.parse(lastShown.get(e.id))));
      pool = list.filter((e) => Date.parse(lastShown.get(e.id)) === oldest);
    }
    let h = 0;
    for (const ch of today) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    const pick = pool[h % pool.length];
    days[today] = pick.id;
    // A year of history is plenty; keep localStorage small.
    const keep = Object.keys(days).sort().slice(-366);
    save(STORE.days, Object.fromEntries(keep.map((d) => [d, days[d]])));
    return pick;
  }
  const lvl = (n) => `<span class="lvl lvl-${n}" title="${esc(S.levelHint)}">${esc(S.levels[n])}</span>`;
  const tags = (e, linked) => e.subjects.map((s) => linked
    ? `<a class="tag" href="${base}/topics/${s}/">${esc(S.subjects[s] ?? s)}</a>`
    : `<span class="tag">${esc(S.subjects[s] ?? s)}</span>`).join("");
  const card = (e) => `<a class="card" href="${e[lang].url}" data-id="${e.id}">
    <div class="card-img"><img src="${e.image}" alt="" loading="lazy" width="400" height="240"></div>
    <div class="meta">${lvl(e.level)}${tags(e, false)}</div>
    <h3>${esc(e[lang].title)}</h3><p>${esc(e[lang].tagline)}</p></a>`;
  async function paintToday() {
    let data;
    try { data = await (await fetch("/v1/terms.json")).json(); } catch { return; } // keep the server-rendered fallback
    const list = data.terms.filter((e) => e.date <= todayISO());
    if (!list.length) return;
    const days = normalizeDays(load(STORE.days, {}));
    const e = pickOfTheDay(list, days);
    const allDays = normalizeDays(load(STORE.days, {}));
    const c = e[lang];
    document.getElementById("today-card").innerHTML = `<article class="hero" data-id="${e.id}">
  <div class="hero-copy">
    <p class="kicker">${esc(fmt(S.dayN, { n: Object.keys(allDays).length }))} · ${esc(fmtDate(todayISO()))}</p>
    <h3 class="hero-title"><a href="${c.url}">${esc(c.title)}</a></h3>
    <p class="tagline">${esc(c.tagline)}</p>
    <div class="meta">${lvl(e.level)}${tags(e, true)}</div>
    <p class="lead">${md(c.lead)}</p>
    <div class="hero-actions">
      <a class="btn primary" href="${c.url}">${esc(S.read)} →</a>
      <button class="btn" type="button" data-learn="${e.id}" aria-pressed="false">${esc(S.markLearned)}</button>
    </div>
    <p class="hero-note mono"><span class="dot" aria-hidden="true"></span>${esc(S.todayNote)}</p>
  </div>
  <div class="hero-img"><img src="${e.image}" alt="${esc(c.imageAlt)}" width="400" height="240"></div>
</article>`;
    const byId = new Map(list.map((x) => [x.id, x]));
    const earlier = Object.keys(allDays).filter((d) => d < todayISO()).sort().reverse()
      .map((d) => byId.get(allDays[d])).filter(Boolean)
      .filter((x, i, a) => x.id !== e.id && a.indexOf(x) === i).slice(0, 3);
    if (earlier.length) {
      document.getElementById("earlier-grid").innerHTML = earlier.map(card).join("");
      document.getElementById("earlier").hidden = false;
    }
    paintLearned();
  }

  // ---------- A–Z filters ----------
  function setupFilters() {
    const box = document.getElementById("filters");
    if (!box) return;
    box.hidden = false;
    const saved = load(STORE.filters, {});
    const f = {
      subjects: Array.isArray(saved.subjects) ? saved.subjects : [],
      levels: Array.isArray(saved.levels) ? saved.levels : [],
      onlyNew: !!saved.onlyNew,
      q: new URLSearchParams(location.search).get("q") ?? "",
    };
    const q = document.getElementById("q");
    const onlyNew = document.getElementById("onlyNew");
    const clear = box.querySelector("[data-clear]");
    const items = [...document.querySelectorAll(".az li[data-id]")];
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    q.value = f.q;
    onlyNew.checked = f.onlyNew;
    function apply() {
      const query = norm(f.q.trim());
      let shown = 0;
      for (const li of items) {
        const subs = li.dataset.subjects.split(" ");
        const ok = (!f.subjects.length || subs.some((s) => f.subjects.includes(s)))
          && (!f.levels.length || f.levels.includes(Number(li.dataset.level)))
          && (!f.onlyNew || !learned.has(li.dataset.id))
          && (!query || norm(li.dataset.search).includes(query));
        li.hidden = !ok;
        if (ok) shown++;
      }
      document.querySelectorAll("section.letter").forEach((s) => { s.hidden = !s.querySelector("li:not([hidden])"); });
      document.querySelectorAll(".letters a").forEach((a) => {
        const target = document.querySelector(a.getAttribute("href"));
        a.classList.toggle("off", !!target?.hidden);
      });
      document.getElementById("count").textContent = count(shown);
      document.getElementById("az-empty").hidden = shown > 0;
      box.querySelectorAll("[data-subject]").forEach((b) => b.setAttribute("aria-pressed", String(f.subjects.includes(b.dataset.subject))));
      box.querySelectorAll("[data-level]").forEach((b) => b.setAttribute("aria-pressed", String(f.levels.includes(Number(b.dataset.level)))));
      clear.hidden = !(f.subjects.length || f.levels.length || f.onlyNew || f.q);
      save(STORE.filters, { subjects: f.subjects, levels: f.levels, onlyNew: f.onlyNew });
      const url = new URL(location.href);
      if (f.q) url.searchParams.set("q", f.q); else url.searchParams.delete("q");
      history.replaceState(null, "", url);
    }
    const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    box.addEventListener("click", (ev) => {
      const s = ev.target.closest("[data-subject]");
      const l = ev.target.closest("[data-level]");
      if (s) f.subjects = toggle(f.subjects, s.dataset.subject);
      else if (l) f.levels = toggle(f.levels, Number(l.dataset.level));
      else if (ev.target.closest("[data-clear]")) { f.subjects = []; f.levels = []; f.onlyNew = false; f.q = ""; q.value = ""; onlyNew.checked = false; }
      else return;
      apply();
    });
    q.addEventListener("input", () => { f.q = q.value; apply(); });
    onlyNew.addEventListener("change", () => { f.onlyNew = onlyNew.checked; apply(); });
    apply();
  }

  // ---------- reading progress ----------
  const readbar = document.getElementById("readbar");
  addEventListener("scroll", () => {
    const h = document.documentElement;
    readbar.style.transform = `scaleX(${h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)})`;
  }, { passive: true });

  // ---------- WebMCP: read-only tools for agents that browse the site ----------
  const mc = document.modelContext ?? navigator.modelContext;
  if (mc?.registerTool) {
    const terms = () => fetch("/v1/terms.json").then((r) => r.json());
    const reply = (text) => ({ content: [{ type: "text", text }] });
    const langArg = { type: "string", enum: ["en", "es"], description: "Language: en or es" };
    [
      { name: "search_terms", description: "Search the Tidbit tech dictionary by term, alias or Spanish name.",
        inputSchema: { type: "object", properties: { query: { type: "string" }, lang: langArg }, required: ["query"] },
        execute: async ({ query, lang: l = lang }) => {
          const q = String(query).toLowerCase();
          const hits = (await terms()).terms.filter((t) => [t.en.title, t.es.title, ...t.en.aliases, ...t.es.aliases].some((n) => n.toLowerCase().includes(q))).slice(0, 8);
          return reply(hits.map((t) => `- ${t[l].title}: ${t[l].tagline} ${t[l].markdown}`).join("\n") || "No match.");
        } },
      { name: "get_term", description: "Read one Tidbit entry as Markdown, by slug (e.g. data-lake).",
        inputSchema: { type: "object", properties: { slug: { type: "string" }, lang: langArg }, required: ["slug"] },
        execute: async ({ slug, lang: l = lang }) => {
          const r = await fetch(`${l === "es" ? "/es" : ""}/${encodeURIComponent(slug)}/index.md`);
          if (!r.ok) throw new Error(`No term "${slug}"`);
          return reply(await r.text());
        } },
    ].forEach((t) => Promise.resolve(mc.registerTool(t)).catch(() => {}));
  }

  paintLearned();
  if (cfg.page === "home") paintToday();
  if (cfg.page === "az") setupFilters();
})();
