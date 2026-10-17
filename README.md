# Tidbit

**The tech dictionary, explained simply, in English and Spanish.** → [tidbit.legios.com.ar](https://tidbit.legios.com.ar/)
AI, AWS, networks, security, hardware, software, data, cloud, tech companies.
Public, open source, no account: what you learned is remembered by your browser, and every day you visit it shows you a new term.

*(En castellano: [LEEME](LEEME.md).)*

Every entry has a one-line definition, two to four short paragraphs, an everyday analogy, three or four points to remember, a hand-drawn style diagram and links to official documentation. Entries have a level (basic, intermediate, advanced), and every technical term that has its own entry is linked automatically wherever it appears.

## How it works

- `content/entries/*.json`: one file per term, both languages inside. `content/img/*.svg`: its illustration. `content/subjects.json`: the topics.
- `scripts/build-index.mjs` (`npm run index`): validates every entry and rebuilds `content/index.json`.
- `scripts/build-site.mjs` (`npm run build`): builds `dist/` with a real HTML page per URL (readable without JavaScript) and its Markdown twin (`index.md`), in English at `/` and Spanish at `/es/`: home, A–Z, topics, every term, About, Contact and Privacy. Also `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, the JSON API (`/data/terms.json`), OpenAPI, the MCP server card and an agent skill.
- `app.js`, `style.css`: what depends on the visitor (term of the day, learned marks, filters) on top of the built pages.
- `site/_worker.js`: the Cloudflare Pages worker. On `Accept: text/markdown` it returns the Markdown version of any page (404s too), adds `Link` headers and serves a read-only MCP server at `/mcp` (`search_terms`, `get_term`, `list_topic`, `term_of_the_day`).
- `.github/workflows/site.yml`: validates and builds the site on every push and pull request, and once a day so future-dated entries appear on their day.

## Run it locally

```bash
npm ci
npm run dev        # http://localhost:8788, with the worker running (wrangler pages dev)
```

## Add an entry

Read [CONTRIBUTING.md](CONTRIBUTING.md): it has the format, the voice and the illustration rules. In short: copy an existing entry, write both languages, draw the SVG, run `npm run index`, open a pull request.

`scripts/generate.mjs` can draft an entry with Claude (needs Anthropic credentials: `ANTHROPIC_API_KEY` or an `ant auth login` profile; an Anthropic-compatible endpoint works through `ANTHROPIC_BASE_URL`). Review what it writes before committing it.

```bash
npm run generate -- --subject networks --topic "DNS"
```

## Publish

`npm run deploy` (`scripts/deploy.sh`) builds the site and uploads it to the `tidbit-legios` Cloudflare Pages project, which serves `tidbit.legios.com.ar`. If the repository has a `CLOUDFLARE_API_TOKEN` secret, the workflow does it on every push to `main`. GitHub Pages stays as a redirect: old links (`legiosai.github.io/tidbit/#/e/...`) go to the new domain.

The share images (`assets/og-*.png`) are drawn by `scripts/og.html`.

## License

[MIT](LICENSE). Made by [Legios](https://github.com/legiosai).
