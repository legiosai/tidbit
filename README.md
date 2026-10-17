<div align="center">

<img src="favicon.svg" alt="" width="96" height="96">

# tidbit

**The tech dictionary, explained simply, in English and Spanish.**
What is an API, a token, a data lake or a VPN? Every term in plain words, for curious people who are not engineers.

[**tidbit.legios.com.ar**](https://tidbit.legios.com.ar/) ·
[En castellano](LEEME.md) ·
[Developers](https://tidbit.legios.com.ar/developers/) ·
MIT

<sub>An instrument by</sub><br>
<a href="https://github.com/legiosai"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/legios.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/legios-claro.svg">
  <img alt="Legios" src="docs/legios-claro.svg" width="132" height="43">
</picture></a>

<a href="https://tidbit.legios.com.ar/"><img src="assets/og-en.png" alt="Tidbit: the tech dictionary, explained simply. AI, cloud, networks, security, data and more, in English and Spanish, free" width="720"></a>

</div>

> **Status: 304 terms in 9 topics**, each one in English and Spanish: AI, AWS, cloud, networks, security, data, hardware, software and tech companies. No account and no tracking: the terms you learned and the term of the day live in your browser.

## What an entry looks like

Every term has a one-line definition, two to four short paragraphs, an everyday analogy, three or four points to remember, a diagram and links to the official documentation. It has a level (basic, intermediate, advanced), and every technical word that has its own entry links to it, so you can follow a thread from the basics to the advanced topics.

<table>
<tr>
<td width="50%"><a href="https://tidbit.legios.com.ar/api/"><img src="content/img/2026-10-11-api.svg" alt="An app sends a request through an API to a server and gets a response"></a><br><b><a href="https://tidbit.legios.com.ar/api/">API</a></b> · basic<br>The menu of things one program lets another program ask for.</td>
<td width="50%"><a href="https://tidbit.legios.com.ar/data-lake/"><img src="content/img/2026-10-17-data-lake.svg" alt="Apps, sensors and exports drop raw files into a lake"></a><br><b><a href="https://tidbit.legios.com.ar/data-lake/">Data lake</a></b> · intermediate<br>Cheap storage where all your data is kept as raw files.</td>
</tr>
<tr>
<td width="50%"><a href="https://tidbit.legios.com.ar/rag/"><img src="content/img/2026-10-14-rag.svg" alt="A question goes through a search over documents and an LLM answers with a citation"></a><br><b><a href="https://tidbit.legios.com.ar/rag/">RAG</a></b> · intermediate<br>Let the model look things up in your documents before it answers.</td>
<td width="50%"><a href="https://tidbit.legios.com.ar/zero-trust/"><img src="content/img/2026-10-17-zero-trust.svg" alt="Castle and moat with a VPN gate, next to zero trust checking every request"></a><br><b><a href="https://tidbit.legios.com.ar/zero-trust/">Zero trust</a></b> · advanced<br>Security that checks every request, instead of trusting whatever is inside the network.</td>
</tr>
</table>

The home page shows a different term every day you visit: one this browser was never shown, basics first. Once you have seen them all, the least recently shown comes back.

## For developers and AI agents

Everything is readable from code, free, read-only and with no account. [Is Agentic](https://is-agentic.com/scan/tidbit.legios.com.ar) scores the site 100/100.

- **Markdown**: send `Accept: text/markdown` to any page, or add `index.md` to its URL. 404s answer in Markdown too.
- **JSON API**: [`/v1/terms.json`](https://tidbit.legios.com.ar/v1/terms.json) lists every term; `/v1/terms/<slug>.json` has the full entry. [OpenAPI](https://tidbit.legios.com.ar/openapi.json), RFC 9457 errors, fair-use `RateLimit` headers.
- **MCP server**: [`/mcp`](https://tidbit.legios.com.ar/.well-known/mcp/server-card.json), Streamable HTTP with no auth, with `search_terms`, `get_term`, `list_topic` and `term_of_the_day`.

```json
{ "mcpServers": { "tidbit": { "type": "http", "url": "https://tidbit.legios.com.ar/mcp" } } }
```

- **For agents**: [`llms.txt`](https://tidbit.legios.com.ar/llms.txt) says when to use Tidbit and when not; [`llms-full.txt`](https://tidbit.legios.com.ar/llms-full.txt) has every entry.

## How it works

- `content/entries/*.json`: one file per term, both languages inside. `content/img/*.svg`: its diagram. `content/subjects.json`: the topics.
- `scripts/build-index.mjs` (`npm run index`): validates every entry and rebuilds `content/index.json`.
- `scripts/build-site.mjs` (`npm run build`): builds `dist/` with a real HTML page per URL (readable without JavaScript) and its Markdown twin, in English at `/` and Spanish at `/es/`: home, A–Z, topics, every term, About, Contact, Privacy and Developers. Also the sitemap, `robots.txt`, `llms.txt`, the JSON API, OpenAPI, the MCP server card and an agent skill.
- `app.js`, `style.css`: what depends on the visitor (term of the day, learned marks, A–Z filters) on top of the built pages.
- `site/_worker.js`: the Cloudflare Pages worker. Markdown on `Accept: text/markdown` with `Vary: Accept`, `Link` headers, JSON errors and rate limits on the API, and the MCP server.
- `.github/workflows/site.yml`: validates and builds the site on every push and pull request, and once a day so future-dated entries appear on their day.

## Run it locally

```bash
npm ci
npm run dev        # http://localhost:8788, with the worker running (wrangler pages dev)
```

## Add an entry

Read [CONTRIBUTING.md](CONTRIBUTING.md): it has the format, the voice and the rules for the diagrams. In short: copy an existing entry, write both languages, draw the SVG, run `npm run index`, open a pull request.

`scripts/generate.mjs` can draft an entry with Claude (needs Anthropic credentials: `ANTHROPIC_API_KEY` or an `ant auth login` profile; an Anthropic-compatible endpoint works through `ANTHROPIC_BASE_URL`). Review what it writes before committing it.

```bash
npm run generate -- --subject networks --topic "DNS"
```

## Publish

`npm run deploy` (`scripts/deploy.sh`) builds the site and uploads it to the `tidbit-legios` Cloudflare Pages project, which serves `tidbit.legios.com.ar`. If the repository has a `CLOUDFLARE_API_TOKEN` secret, the workflow does it on every push to `main`. GitHub Pages stays as a redirect: old links (`legiosai.github.io/tidbit/#/e/...`) go to the new domain.

The share images (`assets/og-*.png`) are drawn by `scripts/og.html`.

**Search engines.** Google reads `sitemap.xml` (every page in both languages, with `hreflang`); the site is registered in Google Search Console. Bing, which also powers ChatGPT search and Copilot, gets new and changed terms through IndexNow: `npm run indexnow` sends every URL, and the workflow sends the changed ones after each deploy. The key is `site/<key>.txt`.

## License

[MIT](LICENSE). Made by [Legios](https://github.com/legiosai).
