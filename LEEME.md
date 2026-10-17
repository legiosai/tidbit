# Tidbit

**El diccionario tech, explicado fácil, en castellano y en inglés.** → [tidbit.legios.com.ar](https://tidbit.legios.com.ar/es/)
IA, AWS, redes, seguridad, hardware, software, datos, cloud, empresas tech.
Público, open source, sin cuenta: lo que aprendiste lo recuerda tu navegador, y cada día que entrás te muestra un término nuevo.

*(In English: [README](README.md).)*

Cada entrada tiene una definición de una línea, dos a cuatro párrafos cortos, una analogía cotidiana, tres o cuatro puntos para recordar, un diagrama simple y links a documentación oficial. Las entradas tienen nivel (básico, intermedio, avanzado), y cada término técnico que tiene su propia entrada queda linkeado automáticamente donde aparece.

## Cómo funciona

- `content/entries/*.json`: un archivo por término, con los dos idiomas adentro. `content/img/*.svg`: su ilustración. `content/subjects.json`: los temas.
- `scripts/build-index.mjs` (`npm run index`): valida cada entrada y regenera `content/index.json`.
- `scripts/build-site.mjs` (`npm run build`): arma `dist/` con una página HTML real por URL (se lee sin JavaScript) y su gemela en Markdown (`index.md`), en inglés en `/` y en castellano en `/es/`: inicio, A–Z, temas, cada término, Acerca de, Contacto y Privacidad. También `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, la API JSON (`/data/terms.json`), OpenAPI, el server card de MCP y una skill para agentes.
- `app.js`, `style.css`: lo que depende de quien visita (el término del día, las aprendidas, los filtros) sobre las páginas ya armadas.
- `site/_worker.js`: el worker de Cloudflare Pages. Con `Accept: text/markdown` devuelve la versión Markdown de cualquier página (también los 404), suma headers `Link` y atiende un servidor MCP de solo lectura en `/mcp` (`search_terms`, `get_term`, `list_topic`, `term_of_the_day`).
- `.github/workflows/site.yml`: valida y arma el sitio en cada push y pull request, y una vez por día para publicar las entradas con fecha futura.

## Correr local

```bash
npm ci
npm run dev        # http://localhost:8788, con el worker andando (wrangler pages dev)
```

## Agregar una entrada

Leé [CONTRIBUTING.md](CONTRIBUTING.md): tiene el formato, la voz y las reglas de la ilustración. En corto: copiá una entrada existente, escribí los dos idiomas, dibujá el SVG, corré `npm run index`, abrí un pull request.

`scripts/generate.mjs` puede redactar un borrador con Claude (necesita credenciales de Anthropic: `ANTHROPIC_API_KEY` o un perfil de `ant auth login`; un endpoint compatible con Anthropic funciona vía `ANTHROPIC_BASE_URL`). Revisá lo que escribe antes de commitearlo.

```bash
npm run generate -- --subject networks --topic "DNS"
```

## Publicar

`npm run deploy` (`scripts/deploy.sh`) arma el sitio y lo sube al proyecto `tidbit-legios` de Cloudflare Pages, que sirve `tidbit.legios.com.ar`. Si el repo tiene el secreto `CLOUDFLARE_API_TOKEN`, el workflow lo hace solo en cada push a `main`. GitHub Pages queda como redirección: los links viejos (`legiosai.github.io/tidbit/#/e/...`) llevan al dominio nuevo.

Las imágenes para compartir (`assets/og-*.png`) se dibujan con `scripts/og.html`.

## Licencia

[MIT](LICENSE). Hecho por [Legios](https://github.com/legiosai).
