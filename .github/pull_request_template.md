<!-- For a new or changed term. CI runs every check below; this list is so you know what it looks at. -->

**Term(s):** <!-- e.g. "Docker (software, level 1)" -->

- [ ] `content/entries/<date>-<slug>.json` with English and Spanish written as native pieces (rioplatense voseo), following [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] `content/img/<date>-<slug>.svg`, drawn with the palette and rules in CONTRIBUTING
- [ ] Links are official docs or Wikipedia, `https`, and I opened each one
- [ ] Aliases are how the term appears in running text, and none is already another term's title or alias
- [ ] `npm run check` passes locally (builds the site and checks pages, Markdown, sitemap, `llms.txt`, the API and the MCP tools)

What CI adds on a pull request: `node scripts/check.mjs --links` opens the external links of the entries you changed.
