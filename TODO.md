# Pendientes

## Publicación

- Secreto `CLOUDFLARE_API_TOKEN` en el repo. Sin él, el job diario de `site.yml` (cron 03:17 UTC) solo valida y
  avisa "Sin CLOUDFLARE_API_TOKEN": las entradas con fecha futura aparecen recién con un `npm run deploy` a mano.
  Con el secreto, el workflow publica en cada push a `main` y una vez por día.
- "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General). `contribution.yml`
  abre el PR de un término aceptado con `GITHUB_TOKEN`, y sin ese permiso `gh pr create` falla.
- Dar de alta el dominio en Google Search Console y mandar `https://tidbit.legios.com.ar/sitemap.xml`.

## Contenido

Nada pendiente: las ideas de la tanda anterior ya están escritas. El formato está en CONTRIBUTING.md.
