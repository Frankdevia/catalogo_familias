/**
 * Reglas de los formularios, para el lado del sitio.
 *
 * El contenido de verdad está en `supabase/functions/_shared/reglas.ts`, que es
 * la única fuente y la comparten el navegador y la Edge Function que valida en
 * el servidor. Este archivo existe solo para que los componentes y los scripts
 * sigan importando `../data/registro`, como han hecho siempre.
 *
 * Está en `supabase/` y no aquí porque el empaquetador de las Edge Functions
 * solo garantiza lo que cuelga de `supabase/functions/`, mientras que Vite
 * alcanza cualquier archivo de la raíz del proyecto. La fuente única va donde
 * manda la herramienta estricta. La explicación larga está allá.
 */
export {
  LIMITES,
  PATRON_TELEFONO,
  FOTO,
  CAMPO_TRAMPA,
  normalizarTelefono,
  normalizarWeb,
  normalizarInstagram,
} from '../../supabase/functions/_shared/reglas';
