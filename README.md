# Tidbit

**Technology concepts explained simply, in English and Spanish.**
AI, AWS, networks, security, hardware, software, data, cloud, tech companies.
Public, open source, no account: what you learned is remembered by your browser.

*(En castellano: [LEEME](LEEME.md).)*

Every entry has a one-line definition, two to four short paragraphs, an everyday analogy, three or four points to remember, a hand-drawn style diagram and links to official documentation. Entries have a level (basic, intermediate, advanced), and every technical term that has its own entry is linked automatically wherever it appears.

## How it works

- `index.html`, `app.js`, `style.css`: the whole site. No framework, no build step.
- `content/entries/*.json`: one file per concept, both languages inside.
- `content/img/*.svg`: the illustration of each entry.
- `content/subjects.json`: the subjects you can filter by.
- `content/index.json`: the list the site reads. Rebuilt and validated with `npm run index`.
- `.github/workflows/site.yml`: validates the content and publishes to GitHub Pages on every push to `main`. No secrets.

## Run it locally

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Add an entry

Read [CONTRIBUTING.md](CONTRIBUTING.md): it has the format, the voice and the illustration rules. In short: copy an existing entry, write both languages, draw the SVG, run `npm run index`, open a pull request.

`scripts/generate.mjs` can draft an entry with Claude (needs Anthropic credentials: `ANTHROPIC_API_KEY` or an `ant auth login` profile; an Anthropic-compatible endpoint works through `ANTHROPIC_BASE_URL`). Review what it writes before committing it.

```bash
npm run generate -- --subject networks --topic "DNS"
```

## Publish

Settings → Pages → Source "GitHub Actions". Push to `main`. For a custom domain, add it under Settings → Pages and point a CNAME at `legiosai.github.io`.

## License

[MIT](LICENSE). Made by [Legios](https://github.com/legiosai).
