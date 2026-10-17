// Cloudflare Pages in advanced mode: serves the static build from scripts/build-site.mjs as is, and adds what agents need.
// 1) Accept: text/markdown on any page returns its Markdown twin (index.md next to index.html), with Vary: Accept.
//    A page that does not exist answers 404 with a Markdown body that points to the A–Z list, llms.txt and the sitemap.
// 2) Link headers (RFC 8288) on HTML: llms.txt, the sitemap, the API and AI catalogs, and the page's Markdown twin.
// 3) A read-only MCP server at /mcp (Streamable HTTP, JSON responses, no auth), backed by the static JSON API.
// 4) The JSON API (/v1/) and /mcp answer errors as RFC 9457 problem+json and carry fair-use RateLimit headers.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version" };
const LINKS = [
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
];
// Discovery URLs without an extension, served from a file that has one.
const ALIASES = {
  "/.well-known/api-catalog": ["/.well-known/api-catalog", "application/linkset+json"],
  "/.well-known/mcp": ["/.well-known/mcp.json", "application/json"],
  "/mcp/server-card": ["/mcp/server-card.json", "application/json"],
};

// Fair use per client IP, counted per worker isolate: an approximation, but a real limit (see /developers/).
const RATE = { limit: 300, window: 60 };
const hits = new Map();
function rate(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now >= h.reset) { h = { count: 0, reset: now + RATE.window * 1000 }; hits.set(ip, h); }
  h.count++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
  const t = Math.max(1, Math.ceil((h.reset - now) / 1000));
  return { ok: h.count <= RATE.limit, retry: t, headers: { "RateLimit-Policy": `"fair";q=${RATE.limit};w=${RATE.window}`, "RateLimit": `"fair";r=${Math.max(0, RATE.limit - h.count)};t=${t}` } };
}
function problem(url, status, code, title, detail, resolution, extra = {}) {
  return new Response(JSON.stringify({ type: new URL(`/developers/#errors`, url).toString(), title, status, code, detail, instance: url.pathname, resolution, documentation_url: new URL("/developers/", url).toString() }, null, 2),
    { status, headers: { "Content-Type": "application/problem+json", ...CORS, ...extra } });
}
const wantsJson = (req) => /\bapplication\/(json|problem\+json)\b/i.test(req.headers.get("Accept") || "") && !/\btext\/html\b/i.test(req.headers.get("Accept") || "");

const wantsMarkdown = (req) => /\btext\/markdown\b/i.test(req.headers.get("Accept") || "");
// A page URL → its Markdown twin. Files with an extension other than .html have none.
function markdownFor(p) {
  if (p.endsWith("/")) return `${p}index.md`;
  if (p.endsWith("/index.html")) return p.replace(/index\.html$/, "index.md");
  if (!/\.[a-z0-9]+$/i.test(p)) return `${p}/index.md`;
  return null;
}
function markdown(req, text, status) {
  return new Response(req.method === "HEAD" ? null : text, {
    status,
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Vary": "Accept", "x-markdown-tokens": String(Math.ceil(text.length / 4)), "Link": LINKS.join(", "), ...CORS },
  });
}
function decorate(res, p) {
  const h = new Headers(res.headers);
  if (p.endsWith(".md")) h.set("Content-Type", "text/markdown; charset=utf-8");
  if (p.endsWith(".txt")) h.set("Content-Type", "text/plain; charset=utf-8");
  if (/^\/(v1|\.well-known|mcp|skills)\//.test(p) || /\.(md|txt|json)$/.test(p)) for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  if ((h.get("Content-Type") || "").startsWith("text/html")) {
    const md = res.status === 200 && markdownFor(p);
    for (const l of md ? [...LINKS, `<${md}>; rel="alternate"; type="text/markdown"`] : LINKS) h.append("Link", l);
    h.append("Vary", "Accept");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p === "/mcp" || p === "/mcp/" || p.startsWith("/v1/")) {
      const r = rate(req);
      if (!r.ok) return problem(url, 429, "rate_limited", "Too many requests", `More than ${RATE.limit} requests in ${RATE.window} seconds.`, `Wait ${r.retry} seconds, or download everything at once from /v1/terms.json.`, { ...r.headers, "Retry-After": String(r.retry) });
      const res = p.startsWith("/v1/") ? await api(req, env, url) : await mcp(req, env, url);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(r.headers)) out.headers.set(k, v);
      return out;
    }
    if (ALIASES[p]) {
      const [file, type] = ALIASES[p];
      const r = await env.ASSETS.fetch(new URL(file, url));
      return new Response(req.method === "HEAD" ? null : r.body, { status: r.status, headers: { "Content-Type": type, ...CORS } });
    }
    if (wantsMarkdown(req) && (req.method === "GET" || req.method === "HEAD")) {
      const md = markdownFor(p);
      if (md) {
        const r = await env.ASSETS.fetch(new URL(md, url));
        if (r.ok) return markdown(req, await r.text(), 200);
      }
      const res = await env.ASSETS.fetch(req);
      if (res.status === 404) {
        const nf = await env.ASSETS.fetch(new URL("/404.md", url));
        return markdown(req, await nf.text(), 404);
      }
      return decorate(res, p);
    }
    const res = await env.ASSETS.fetch(req);
    if (res.status === 404 && wantsJson(req)) return problem(url, 404, "not_found", "Not found", `Nothing lives at ${p}.`, "See /llms.txt for what this site offers, or /v1/terms.json for every term.");
    return decorate(res, p);
  },
};

async function api(req, env, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return problem(url, 405, "method_not_allowed", "Method not allowed", `The API is read-only; ${req.method} is not supported.`, "Use GET.", { Allow: "GET, HEAD, OPTIONS" });
  const res = await env.ASSETS.fetch(req);
  if (res.status === 404) {
    const slug = (url.pathname.match(/^\/v1\/terms\/([^/]+?)(\.json)?$/) || [])[1];
    return slug
      ? problem(url, 404, "not_found", "Term not found", `No term has the slug '${slug}'.`, "List every term with its slug at /v1/terms.json, or search with the MCP tool search_terms at /mcp.")
      : problem(url, 404, "not_found", "Not found", `The API has no ${url.pathname}.`, "The endpoints are /v1/terms.json and /v1/terms/{slug}.json; see /openapi.json.");
  }
  const h = new Headers(res.headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

// ---------- MCP ----------
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const LANG = { type: "string", enum: ["en", "es"], description: "Language of the answer: en (default) or es." };
// Descriptions stay short on purpose: an agent pays for them on every request.
const TOOLS = [
  { name: "define", title: "Define terms",
    description: "Plain-language definition of one or more tech terms (name, alias or Spanish name): one line, an analogy and a link, about 80 words each. Use first for 'what is X'.",
    inputSchema: { type: "object", properties: { terms: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 }, lang: LANG }, required: ["terms"] } },
  { name: "search_terms", title: "Search the dictionary",
    description: "Find terms by words in their name or definition. Returns matches with a one-line definition.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, lang: LANG, limit: { type: "integer", minimum: 1, maximum: 20, default: 5 } }, required: ["query"] } },
  { name: "get_term", title: "Read a term",
    description: "One term as Markdown. detail 'full' (default, ~600 words: explanation, key points, links) or 'short' (same as define).",
    inputSchema: { type: "object", properties: { term: { type: "string", description: "Slug (data-lake) or name" }, lang: LANG, detail: { type: "string", enum: ["full", "short"], default: "full" } }, required: ["term"] } },
  { name: "list_topic", title: "List a topic",
    description: "Every term in a topic, basic to advanced.",
    inputSchema: { type: "object", properties: { topic: { type: "string", enum: ["ai", "aws", "cloud", "hardware", "software", "data", "security", "networks", "companies"] }, lang: LANG }, required: ["topic"] } },
  { name: "term_of_the_day", title: "Term of the day",
    description: "The term picked for a day (default today), the same for everyone.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, lang: LANG } } },
].map((t) => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

let terms; // cached per isolate
async function loadTerms(env, url) {
  if (!terms) terms = await (await env.ASSETS.fetch(new URL("/v1/terms.json", url))).json();
  return terms;
}
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function search(data, query, lang) {
  const q = norm(query).replace(/^(what is|what are|what's|que es|que son|qué es)\s+(an?\s+|el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?/, "").replace(/[?¿!.]+$/, "").trim();
  if (!q) return [];
  return data.terms.map((t) => {
    const names = [t.slug.replace(/-/g, " "), ...["en", "es"].flatMap((l) => [t[l].title, ...t[l].aliases])].map(norm);
    let score = 0;
    if (names.includes(q)) score = 100;
    else if (names.some((n) => n.startsWith(q) || q.startsWith(n))) score = 60;
    else if (names.some((n) => n.includes(q))) score = 40;
    else if (norm(t[lang].tagline).includes(q) || norm(t[lang].lead).includes(q)) score = 15;
    else if (q.split(/\s+/).filter((w) => w.length > 2).some((w) => names.some((n) => n.split(/\s+/).includes(w)))) score = 10;
    return { t, score: score ? score - t.level : 0 };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.t);
}
const LEVELS = { en: ["", "basic", "intermediate", "advanced"], es: ["", "básico", "intermedio", "avanzado"] };
const line = (t, lang, data) => `- ${t[lang].title} (${LEVELS[lang][t.level]}; ${t.subjects.map((s) => data.subjects[s]?.[lang] ?? s).join(", ")}): ${t[lang].tagline} ${t[lang].url}`;
const text = (s, structured) => ({ content: [{ type: "text", text: s }], ...(structured ? { structuredContent: structured } : {}) });
async function termMarkdown(env, url, t, lang) {
  const r = await env.ASSETS.fetch(new URL(`${lang === "es" ? "/es" : ""}/${t.slug}/index.md`, url));
  return r.ok ? r.text() : `# ${t[lang].title}\n\n> ${t[lang].tagline}\n\n${t[lang].lead}\n\n${t[lang].url}`;
}

const short = (t, lang) => `${t[lang].title} (${LEVELS[lang][t.level]}): ${t[lang].tagline}\n${lang === "es" ? "Analogía" : "Analogy"}: ${t[lang].analogy}\n${t[lang].url}`;
const find = (data, term, lang) => data.terms.find((x) => x.slug === norm(term).replace(/\s+/g, "-")) ?? search(data, term, lang)[0];

async function callTool(name, args, env, url) {
  const data = await loadTerms(env, url);
  const lang = args?.lang === "es" ? "es" : "en";
  if (name === "define") {
    const asked = Array.isArray(args?.terms) ? args.terms.filter((x) => typeof x === "string" && x.trim()).slice(0, 10) : typeof args?.terms === "string" ? [args.terms] : [];
    if (!asked.length) throw rpcError(-32602, "terms is required");
    const out = asked.map((q) => { const t = find(data, q, lang); return t ? short(t, lang) : `${q}: not in Tidbit.`; });
    return text(out.join("\n\n"));
  }
  if (name === "search_terms") {
    if (typeof args?.query !== "string" || !args.query.trim()) throw rpcError(-32602, "query is required");
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
    const hits = search(data, args.query, lang).slice(0, limit);
    if (!hits.length) return text(`No term matches "${args.query}". Browse every term at ${new URL(lang === "es" ? "/es/a-z/" : "/a-z/", url)}.`, { results: [] });
    return text(hits.map((t) => line(t, lang, data)).join("\n"));
  }
  if (name === "get_term") {
    if (typeof args?.term !== "string" || !args.term.trim()) throw rpcError(-32602, "term is required");
    const t = find(data, args.term, lang);
    if (!t) return { ...text(`No term matches "${args.term}". Try search_terms first.`), isError: true };
    return text(args.detail === "short" ? short(t, lang) : await termMarkdown(env, url, t, lang));
  }
  if (name === "list_topic") {
    const list = data.terms.filter((t) => t.subjects.includes(args?.topic));
    if (!list.length) throw rpcError(-32602, `Unknown topic "${args?.topic}"`);
    return text([1, 2, 3].map((n) => list.filter((t) => t.level === n).map((t) => line(t, lang, data)).join("\n")).filter(Boolean).join("\n"));
  }
  if (name === "term_of_the_day") {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(args?.date ?? "") ? args.date : new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    const t = data.terms[h % data.terms.length];
    return text(`Term of the day for ${day}:\n\n${await termMarkdown(env, url, t, lang)}`);
  }
  throw rpcError(-32602, `Unknown tool "${name}"`);
}

function rpcError(code, message) { return Object.assign(new Error(message), { rpc: { code, message } }); }
async function handle(msg, env, url) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid request" } };
  if (msg.id === undefined || msg.id === null) return null; // notifications (notifications/initialized, cancelled…)
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  try {
    switch (msg.method) {
      case "initialize": {
        const asked = msg.params?.protocolVersion;
        return ok({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "io.github.legiosai/tidbit", title: "Tidbit", version: "1.0.0" },
          instructions: "Bilingual (en/es) dictionary of tech terms in plain language. For 'what is X' call define (several terms at once); get_term only when the full explanation is needed. Read-only.",
        });
      }
      case "ping": return ok({});
      case "tools/list": return ok({ tools: TOOLS });
      case "tools/call": return ok(await callTool(msg.params?.name, msg.params?.arguments ?? {}, env, url));
      default: return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
    }
  } catch (err) {
    return { jsonrpc: "2.0", id: msg.id, error: err.rpc ?? { code: -32603, message: "Internal error" } };
  }
}
async function mcp(req, env, url) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ name: "Tidbit MCP server", transport: "streamable-http", usage: "POST JSON-RPC 2.0 messages to this URL.", serverCard: new URL("/.well-known/mcp/server-card.json", url).toString() }),
      { status: 405, headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS } });
  }
  let body;
  try { body = await req.json(); } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body) ? body : [body];
  const results = (await Promise.all(batch.map((m) => handle(m, env, url)))).filter(Boolean);
  if (!results.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? results : results[0], { headers: CORS });
}
