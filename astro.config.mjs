// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const POR_DEFECTO = 'https://liceoingles.edu.co';

/*
 * Ojo con `||` en vez de `??`: en el Dockerfile, `ENV SITE_URL=$SITE_URL` sin
 * build arg deja la variable como CADENA VACÍA, no como undefined. Con `??` esa
 * cadena vacía pasaba tal cual y Astro abortaba el build con "site: Invalid url".
 */
const site = process.env.SITE_URL || POR_DEFECTO;

// Solo si el catálogo cuelga de un subdirectorio, p. ej. "/apoye-familias".
const base = process.env.BASE_PATH || undefined;

// Mejor un error legible aquí que un "Invalid url" a mitad del build.
try {
  new URL(site);
} catch {
  throw new Error(
    `SITE_URL no es una URL válida: ${JSON.stringify(site)}. ` +
      `Debe incluir el protocolo, p. ej. https://catalogo.liceoingles.edu.co`,
  );
}

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
