/**
 * Categorías del catálogo, en el orden en que aparecen los chips del diseño.
 * Es la única fuente de verdad: `content.config.ts` valida contra esta lista
 * y `Filtros.astro` genera los chips a partir de ella.
 */
export const CATEGORIAS = [
  'Gastronomía',
  'Moda',
  'Servicios',
  'Salud y bienestar',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Etiqueta del chip que desactiva el filtro. No es una categoría real. */
export const TODOS = 'Todos';
