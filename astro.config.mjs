// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: reemplazar por el dominio real del colegio antes del primer deploy.
// Si el sitio vive en un subdirectorio, añadir tambien `base: '/catalogo'`.
export default defineConfig({
  site: 'https://liceoingles.edu.co',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    // El servidor propio sirve archivos planos: /negocio/panaderia.html
    format: 'directory',
  },
});
