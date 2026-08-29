// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// El dominio se pasa por entorno en el build (ver Dockerfile y README).
// De `site` salen el sitemap, las URL canónicas y las etiquetas Open Graph.
const site = process.env.SITE_URL ?? 'https://liceoingles.edu.co';

// Solo si el catálogo cuelga de un subdirectorio, p. ej. "/apoye-familias".
const base = process.env.BASE_PATH || undefined;

export default defineConfig({
  site,
  ...(base ? { base } : {}),
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    // El servidor sirve archivos planos: /negocio/<slug>/index.html
    format: 'directory',
  },
});
