# Rutahz

Kilometraje de las rutas de visitas, creado por Krahz. La web está en `site/` y se publica sola en Cloudflare Pages al subir cambios a `main` (ver `.github/workflows/deploy.yml`). Despliegue y migración desde Netlify: `LEEME-DESPLIEGUE.md`.

- El código se edita en `tools/src/` y se une con `tools/build.sh` en `site/index.html`.
- En cada versión: subir `VER` en `tools/src/app1.js` (formato `AAAA-MM-DD-N`) y `V` en `site/sw.js`.
- Versión visible en la app: Ajustes › App.
