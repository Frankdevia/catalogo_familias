// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// El dominio real donde vive el catálogo hoy. Es el valor por defecto para
// que un despliegue sin SITE_URL siga generando sitemap y canonical correctos;
// la variable de entorno sigue mandando si algún día hay dominio propio.
const POR_DEFECTO = 'https://comunidad.liceoingles.edu.co';

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
  integrations: [
    // Los formularios no son contenido del catálogo: fuera del sitemap.
    sitemap({
      filter: (pagina) =>
        !pagina.includes('/registrar') &&
        !pagina.includes('/clasificados/nuevo') &&
        // El panel no es contenido y además va con noindex.
        !pagina.includes('/admin'),
    }),
  ],
  build: {
    // El servidor sirve archivos planos: /negocio/<slug>/index.html
    format: 'directory',
  },
});
