# Tidbit

**Conceptos de tecnología explicados fácil, en inglés y en español.**
IA, AWS, redes, seguridad, hardware, software, datos, cloud, empresas tech.
Público, open source, sin cuenta: lo que aprendiste lo recuerda tu navegador.

*(In English: [README](README.md).)*

Cada entrada tiene una definición de una línea, dos a cuatro párrafos cortos, una analogía cotidiana, tres o cuatro puntos para recordar, un diagrama simple y links a documentación oficial. Las entradas tienen nivel (básico, intermedio, avanzado), y cada término técnico que tiene su propia entrada queda linkeado automáticamente donde aparece.

## Cómo funciona

- `index.html`, `app.js`, `style.css`: el sitio entero. Sin framework, sin build.
- `content/entries/*.json`: un archivo por concepto, con los dos idiomas adentro.
- `content/img/*.svg`: la ilustración de cada entrada.
- `content/subjects.json`: los temas por los que se filtra.
- `content/index.json`: el listado que lee la página. Se regenera y valida con `npm run index`.
- `.github/workflows/site.yml`: valida el contenido y publica en GitHub Pages en cada push a `main`. Sin secretos.

## Correr local

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Agregar una entrada

Leé [CONTRIBUTING.md](CONTRIBUTING.md): tiene el formato, la voz y las reglas de la ilustración. En corto: copiá una entrada existente, escribí los dos idiomas, dibujá el SVG, corré `npm run index`, abrí un pull request.

`scripts/generate.mjs` puede redactar un borrador con Claude (necesita credenciales de Anthropic: `ANTHROPIC_API_KEY` o un perfil de `ant auth login`; un endpoint compatible con Anthropic funciona vía `ANTHROPIC_BASE_URL`). Revisá lo que escribe antes de commitearlo.

```bash
npm run generate -- --subject networks --topic "DNS"
```

## Publicar

Settings → Pages → Source "GitHub Actions". Push a `main`. Para un dominio propio, agregalo en Settings → Pages y apuntá un CNAME a `legiosai.github.io`.

## Licencia

[MIT](LICENSE). Hecho por [Legios](https://github.com/legiosai).
