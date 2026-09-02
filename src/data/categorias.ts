/**
 * Categorías del catálogo, en el orden en que aparecen los chips del diseño.
 * Es la única fuente de verdad: `content.config.ts` valida contra esta lista
 * y `Filtros.astro` genera los chips a partir de ella.
 *
 * Las cuatro primeras vienen del diseño; las añadidas después van al final
 * para no reordenar los chips que la comunidad ya conoce.
 *
 * Si se añade una categoría, hay que añadirla también al nodo "Validar
 * solicitud" del workflow de recepción de n8n y al de "Empaquetar para GitHub"
 * del de publicación: la lista está repetida allí y no compila con esta.
 */
export const CATEGORIAS = [
  'Gastronomía',
  'Moda',
  'Servicios',
  'Salud y bienestar',
  'Productos',
  'Accesorios',
  'Tecnología',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Etiqueta del chip que desactiva el filtro. No es una categoría real. */
export const TODOS = 'Todos';
