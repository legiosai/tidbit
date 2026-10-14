/* Tidbit: technology concepts explained simply. No build step, no backend, no login.
   Content lives in content/index.json (list) and content/entries/<id>.json (detail).
   Progress ("learned"), language and filters live in localStorage of this browser only. */
(() => {
  "use strict";

  const STORE = { lang: "tidbit.lang", learned: "tidbit.learned", filters: "tidbit.filters" };

  const I18N = {
    en: {
      "nav.today": "Home", "nav.all": "All", "nav.learned": "Learned",
      loading: "Loading…", "foot.made": "Made by", "foot.source": "Source",
      "foot.progress": "Your progress stays in this browser. No account, no login.",
      todaysPick: "Today's tidbit", newest: "New", bySubject: "By subject",
      read: "Read", markLearned: "Mark as learned", learned: "Learned ✓",
      search: "Search a concept…", onlyNew: "Only what I haven't learned yet",
      clear: "Clear filters", none: "Nothing matches those filters.",
      noneLearned: "Nothing learned yet. Open an entry and mark it when it clicks.",
      progress: (a, b) => `${a} of ${b} learned`,
      analogy: "An analogy", points: "Keep in mind", links: "Go deeper", more: "More in",
      prev: "← Previous", next: "Next →", back: "← All concepts",
      allTitle: "All concepts", learnedTitle: "What you learned",
      langName: "ES", notFound: "That entry does not exist.",
      count: (n) => `${n} concept${n === 1 ? "" : "s"}`,
      level: "Level", levels: { 1: "Basic", 2: "Intermediate", 3: "Advanced" },
      levelHint: "Basic reads cold. Intermediate assumes the basics of its subject. Advanced assumes intermediate.",
      siteTitle: "Tidbit · tech, explained simply",
    },
    es: {
      "nav.today": "Inicio", "nav.all": "Todas", "nav.learned": "Aprendidas",
      loading: "Cargando…", "foot.made": "Hecho por", "foot.source": "Código",
      "foot.progress": "Tu progreso queda en este navegador. Sin cuenta ni login.",
      todaysPick: "El tidbit de hoy", newest: "Nuevas", bySubject: "Por tema",
      read: "Leer", markLearned: "Marcar como aprendida", learned: "Aprendida ✓",
      search: "Buscá un concepto…", onlyNew: "Solo lo que todavía no aprendí",
      clear: "Limpiar filtros", none: "Nada coincide con esos filtros.",
      noneLearned: "Todavía no marcaste nada. Abrí una entrada y marcala cuando te cierre.",
      progress: (a, b) => `${a} de ${b} aprendidas`,
      analogy: "Una analogía", points: "Para quedarse", links: "Para seguir leyendo", more: "Más de",
      prev: "← Anterior", next: "Siguiente →", back: "← Todos los conceptos",
      allTitle: "Todos los conceptos", learnedTitle: "Lo que aprendiste",
      langName: "EN", notFound: "Esa entrada no existe.",
      count: (n) => `${n} concepto${n === 1 ? "" : "s"}`,
      level: "Nivel", levels: { 1: "Básico", 2: "Intermedio", 3: "Avanzado" },
      levelHint: "Básico se lee sin saber nada. Intermedio asume lo básico del tema. Avanzado asume lo intermedio.",
      siteTitle: "Tidbit · tecnología, explicada fácil",
    },
  };

  // ---------- state ----------
  const state = {
    lang: load(STORE.lang, navigator.language.startsWith("es") ? "es" : "en"),
    learned: new Set(load(STORE.learned, [])),
    filters: normalizeFilters(load(STORE.filters, {})),
    subjects: {},
    entries: [],
    byId: new Map(),
    cache: new Map(),
    terms: { en: null, es: null }, // built lazily: regex + lookup for auto-linking
  };

  function normalizeFilters(f) {
    return { subjects: Array.isArray(f.subjects) ? f.subjects : [], levels: Array.isArray(f.levels) ? f.levels : [], q: typeof f.q === "string" ? f.q : "", onlyNew: !!f.onlyNew };
  }
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  }
  const t = (k, ...a) => { const v = I18N[state.lang][k]; return typeof v === "function" ? v(...a) : (v ?? k); };

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Tiny inline markdown: **bold** and `code`, after escaping.
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const todayISO = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(state.lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long", year: "numeric" });
  const subjLabel = (id) => state.subjects[id]?.[state.lang] ?? id;
  const L = (e) => e[state.lang] ?? e.en;
  const tags = (e) => e.subjects.map((s) => `<span class="tag">${esc(subjLabel(s))}</span>`).join("");
  const lvl = (n) => `<span class="lvl lvl-${n}" title="${esc(t("levelHint"))}">${esc(t("levels")[n] ?? n)}</span>`;

  // ---------- auto-linking of terms ----------
  // Every entry's title and aliases (per language) become links when they appear in another entry's text.
  // Longest terms first so "Amazon API Gateway" wins over "API". Acronyms (all caps, short) must match case.
  function termIndex(lang) {
    if (state.terms[lang]) return state.terms[lang];
    const lookup = new Map(); // lowercased term -> { id, canonical }
    for (const e of state.entries) {
      for (const term of [e.title[lang], ...(e.aliases?.[lang] ?? [])]) {
        const k = term.trim().toLowerCase();
        if (k.length >= 2 && !lookup.has(k)) lookup.set(k, { id: e.id, canonical: term.trim() });
      }
    }
    const words = [...lookup.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
    return (state.terms[lang] = { re, lookup });
  }
  // html: already-escaped markup from md(). Links are added only in text outside tags, and never inside <code> or <a>.
  function linkTerms(html, selfId, linked) {
    const { re, lookup } = termIndex(state.lang);
    if (!re) return html;
    let depth = 0; // inside <code>…</code> or <a>…</a>
    return html.split(/(<[^>]+>)/).map((part) => {
      if (part.startsWith("<")) {
        if (/^<(code|a)\b/i.test(part)) depth++;
        else if (/^<\/(code|a)\b/i.test(part)) depth = Math.max(0, depth - 1);
        return part;
      }
      if (depth > 0 || !part) return part;
      return part.replace(re, (m) => {
        const hit = lookup.get(m.toLowerCase());
        if (!hit || hit.id === selfId || linked.has(hit.id)) return m;
        const isAcronym = hit.canonical.length <= 5 && hit.canonical === hit.canonical.toUpperCase();
        if (isAcronym && m !== hit.canonical) return m;
        linked.add(hit.id);
        return `<a class="term" href="#/e/${esc(hit.id)}">${m}</a>`;
      });
    }).join("");
  }

  // ---------- data ----------
  async function loadData() {
    const [idx, subj] = await Promise.all([
      fetch("content/index.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("content/subjects.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    state.subjects = subj;
    const today = todayISO();
    // Entries dated in the future stay hidden until their day. Index order: newest first, then level, then title.
    state.entries = idx.entries.filter((e) => e.date <= today);
    state.byId = new Map(state.entries.map((e) => [e.id, e]));
    state.terms = { en: null, es: null };
  }
  async function loadEntry(id) {
    if (state.cache.has(id)) return state.cache.get(id);
    const r = await fetch(`content/entries/${encodeURIComponent(id)}.json`);
    if (!r.ok) return null;
    const e = await r.json();
    state.cache.set(id, e);
    return e;
  }

  // ---------- rendering ----------
  const app = document.getElementById("app");

  function card(e) {
    const learned = state.learned.has(e.id);
    return `<a class="card${learned ? " learned" : ""}" href="#/e/${esc(e.id)}">
      <div class="card-img"><img src="content/${esc(e.image)}" alt="" loading="lazy"></div>
      <div class="meta">${lvl(e.level)}${tags(e)}</div>
      <h3>${esc(L(e.title))}</h3>
      <p>${esc(L(e.tagline))}</p>
    </a>`;
  }

  function grid(list, emptyMsg) {
    if (!list.length) return `<p class="empty">${esc(emptyMsg)}</p>`;
    return `<div class="grid">${list.map(card).join("")}</div>`;
  }

  // A deterministic pick that changes every day, so the home page has something new even on days nothing was published.
  function pickOfTheDay() {
    const n = state.entries.length;
    if (!n) return null;
    let h = 0;
    for (const ch of todayISO()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const unlearned = state.entries.filter((e) => !state.learned.has(e.id));
    const pool = unlearned.length ? unlearned : state.entries;
    return pool[h % pool.length];
  }

  function viewHome() {
    const pick = pickOfTheDay();
    if (!pick) return `<p class="empty">${t("none")}</p>`;
    const learned = state.learned.has(pick.id);
    const newest = state.entries.slice(0, 6);
    const subjectCards = Object.keys(state.subjects).map((id) => {
      const all = state.entries.filter((e) => e.subjects.includes(id));
      const done = all.filter((e) => state.learned.has(e.id)).length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      return `<a class="subject" href="#/all" data-filter-subject="${esc(id)}">
        <strong>${esc(subjLabel(id))}</strong>
        <span class="muted">${t("count", all.length)} · ${t("progress", done, all.length)}</span>
        <span class="bar"><span style="width:${pct}%"></span></span>
      </a>`;
    }).join("");
    return `
      <section class="hero">
        <div class="hero-img"><img src="content/${esc(pick.image)}" alt="${esc(L(pick.imageAlt ?? { en: "" }))}"></div>
        <div>
          <p class="kicker">${t("todaysPick")} · ${esc(fmtDate(todayISO()))}</p>
          <h1>${esc(L(pick.title))}</h1>
          <p class="tagline">${esc(L(pick.tagline))}</p>
          <div class="meta" style="margin-bottom:14px">${lvl(pick.level)}${tags(pick)}</div>
          <div class="hero-actions">
            <a class="btn primary" href="#/e/${esc(pick.id)}">${t("read")}</a>
            <button class="btn${learned ? " done" : ""}" data-learn="${esc(pick.id)}">${learned ? t("learned") : t("markLearned")}</button>
          </div>
        </div>
      </section>
      <h2>${t("bySubject")}</h2>
      <div class="subjects">${subjectCards}</div>
      <h2>${t("newest")}</h2>
      ${grid(newest, t("none"))}
      <p style="margin-top:16px"><a class="btn" href="#/all">${t("allTitle")} →</a></p>`;
  }

  function applyFilters(list) {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    return list.filter((e) => {
      if (f.subjects.length && !e.subjects.some((s) => f.subjects.includes(s))) return false;
      if (f.levels.length && !f.levels.includes(e.level)) return false;
      if (f.onlyNew && state.learned.has(e.id)) return false;
      if (q) {
        const hay = [e.title.en, e.title.es, e.tagline.en, e.tagline.es, ...(e.aliases?.en ?? []), ...(e.aliases?.es ?? []), ...e.subjects.map(subjLabel)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // When a subject is chosen, order by level then title (a reading path); otherwise keep newest first.
  function sortForView(list) {
    if (!state.filters.subjects.length) return list;
    return [...list].sort((a, b) => a.level - b.level || L(a.title).localeCompare(L(b.title)));
  }

  function viewAll() {
    const f = state.filters;
    const list = sortForView(applyFilters(state.entries));
    const chips = Object.keys(state.subjects).map((id) =>
      `<button class="chip${f.subjects.includes(id) ? " on" : ""}" data-subject="${esc(id)}">${esc(subjLabel(id))}</button>`).join("");
    const levels = [1, 2, 3].map((n) =>
      `<button class="chip lvlchip${f.levels.includes(n) ? " on" : ""}" data-level="${n}">${esc(t("levels")[n])}</button>`).join("");
    const active = f.subjects.length || f.levels.length || f.q || f.onlyNew;
    return `
      <h1>${t("allTitle")}</h1>
      <p class="muted" id="count">${t("count", list.length)}</p>
      <div class="filters">
        <input class="search" id="q" type="search" placeholder="${esc(t("search"))}" value="${esc(f.q)}" autocomplete="off">
        <div class="chips">${chips}</div>
        <div class="chips"><span class="muted" style="font-size:13px;align-self:center">${t("level")}:</span>${levels}${active ? `<button class="chip ghost" data-clear>${t("clear")}</button>` : ""}</div>
        <label class="toggle"><input type="checkbox" id="onlyNew" ${f.onlyNew ? "checked" : ""}> ${t("onlyNew")}</label>
      </div>
      ${grid(list, t("none"))}`;
  }

  function viewLearned() {
    const list = state.entries.filter((e) => state.learned.has(e.id));
    return `
      <h1>${t("learnedTitle")}</h1>
      <p class="muted">${t("progress", list.length, state.entries.length)}</p>
      ${grid(list, t("noneLearned"))}`;
  }

  async function viewEntry(id) {
    const e = await loadEntry(id);
    if (!e) return `<p class="empty">${t("notFound")}</p>`;
    const c = e[state.lang] ?? e.en;
    const i = state.entries.findIndex((x) => x.id === id);
    const newer = i > 0 ? state.entries[i - 1] : null;
    const older = i >= 0 && i < state.entries.length - 1 ? state.entries[i + 1] : null;
    const learned = state.learned.has(id);
    const linked = new Set(); // each other term is linked once per entry, on its first mention
    const body = (s) => linkTerms(md(s), id, linked);
    const more = state.entries.filter((x) => x.id !== id && x.subjects[0] === e.subjects[0] && !state.learned.has(x.id)).slice(0, 3);
    document.title = `${c.title} · Tidbit`;
    return `
      <article class="entry" lang="${state.lang}">
        <p class="kicker"><a href="#/all" style="text-decoration:none">${t("back")}</a></p>
        <div class="meta" style="margin-bottom:8px">${lvl(e.level)}${tags(e)}<span class="muted" style="font-size:13px">${esc(fmtDate(e.date))}</span></div>
        <h1>${esc(c.title)}</h1>
        <p class="tagline">${esc(c.tagline)}</p>
        <div class="entry-img"><img src="content/${esc(e.image)}" alt="${esc(L(e.imageAlt ?? { en: "" }))}"></div>
        <div class="prose">${c.explanation.map((p) => `<p>${body(p)}</p>`).join("")}</div>
        ${c.analogy ? `<div class="box"><p class="kicker">${t("analogy")}</p><p>${body(c.analogy)}</p></div>` : ""}
        ${c.keyPoints?.length ? `<h2>${t("points")}</h2><ul class="points">${c.keyPoints.map((k) => `<li>${body(k)}</li>`).join("")}</ul>` : ""}
        ${c.links?.length ? `<h2>${t("links")}</h2><ul class="links">${c.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join("")}</ul>` : ""}
        <div class="entry-foot">
          <button class="btn${learned ? " done" : " primary"}" data-learn="${esc(id)}">${learned ? t("learned") : t("markLearned")}</button>
          <div class="pager">
            ${older ? `<a class="btn" href="#/e/${esc(older.id)}">${t("prev")}</a>` : ""}
            ${newer ? `<a class="btn" href="#/e/${esc(newer.id)}">${t("next")}</a>` : ""}
          </div>
        </div>
      </article>
      ${more.length ? `<section class="entry" style="margin-top:40px"><h2>${t("more")} ${esc(subjLabel(e.subjects[0]))}</h2>${grid(more, "")}</section>` : ""}`;
  }

  // ---------- chrome (header/footer) ----------
  function renderChrome(route) {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.getElementById("lang-toggle").textContent = t("langName");
    document.getElementById("progress").textContent = t("progress", state.learned.size, state.entries.length);
    document.querySelectorAll(".top-nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === `#${route}`);
    });
  }

  // ---------- router ----------
  async function render() {
    const hash = location.hash.replace(/^#/, "") || "/";
    let route = hash, html;
    if (hash.startsWith("/e/")) { route = "/e"; html = await viewEntry(decodeURIComponent(hash.slice(3))); }
    else if (hash === "/all") { html = viewAll(); document.title = `${t("allTitle")} · Tidbit`; }
    else if (hash === "/learned") { html = viewLearned(); document.title = `${t("learnedTitle")} · Tidbit`; }
    else { route = "/"; html = viewHome(); document.title = t("siteTitle"); }
    renderChrome(route);
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- events ----------
  document.getElementById("lang-toggle").addEventListener("click", () => {
    state.lang = state.lang === "es" ? "en" : "es";
    save(STORE.lang, state.lang);
    render();
  });

  app.addEventListener("click", (ev) => {
    const learn = ev.target.closest("[data-learn]");
    if (learn) {
      const id = learn.dataset.learn;
      if (state.learned.has(id)) state.learned.delete(id); else state.learned.add(id);
      save(STORE.learned, [...state.learned]);
      render();
      return;
    }
    const subjCard = ev.target.closest("[data-filter-subject]");
    if (subjCard) {
      state.filters = { subjects: [subjCard.dataset.filterSubject], levels: [], q: "", onlyNew: false };
      save(STORE.filters, state.filters);
      return; // the href takes it to #/all
    }
    const chip = ev.target.closest("[data-subject]");
    if (chip) {
      const id = chip.dataset.subject;
      const s = state.filters.subjects;
      state.filters.subjects = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      save(STORE.filters, state.filters);
      render();
      return;
    }
    const lv = ev.target.closest("[data-level]");
    if (lv) {
      const n = Number(lv.dataset.level);
      const s = state.filters.levels;
      state.filters.levels = s.includes(n) ? s.filter((x) => x !== n) : [...s, n];
      save(STORE.filters, state.filters);
      render();
      return;
    }
    if (ev.target.closest("[data-clear]")) {
      state.filters = normalizeFilters({});
      save(STORE.filters, state.filters);
      render();
    }
  });

  app.addEventListener("input", (ev) => {
    if (ev.target.id === "q") {
      state.filters.q = ev.target.value;
      save(STORE.filters, state.filters);
      // Re-render only the grid so the input keeps focus.
      const list = sortForView(applyFilters(state.entries));
      const gridEl = app.querySelector(".grid, .empty");
      if (gridEl) gridEl.outerHTML = grid(list, t("none"));
      const count = document.getElementById("count");
      if (count) count.textContent = t("count", list.length);
    }
  });
  app.addEventListener("change", (ev) => {
    if (ev.target.id === "onlyNew") {
      state.filters.onlyNew = ev.target.checked;
      save(STORE.filters, state.filters);
      render();
    }
  });

  window.addEventListener("hashchange", render);

  loadData().then(render).catch((err) => {
    app.innerHTML = `<p class="empty">Could not load content. ${esc(err.message)}</p>`;
  });
})();
