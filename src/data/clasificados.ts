/**
 * Categorías de los anuncios clasificados.
 *
 * Es la única fuente de verdad, igual que `categorias.ts` para el catálogo:
 * `content.config.ts` valida contra esta lista, los chips del filtro se generan
 * de ella y el badge de cada tarjeta saca sus colores de aquí.
 *
 * Si se añade una categoría, hay que añadirla también a la lista del nodo
 * "Validar solicitud" del workflow de n8n, o el servidor rechazará los anuncios
 * que la usen.
 */
export const CATEGORIAS_CLASIFICADOS = ['COMPRO', 'VENDO', 'OFREZCO'] as const;

export type CategoriaClasificado = (typeof CATEGORIAS_CLASIFICADOS)[number];

/** Etiqueta del chip que desactiva el filtro. No es una categoría real. */
export const TODOS = 'Todos';

/**
 * Colores del badge de cada categoría, por token del design system.
 *
 * OFREZCO lleva texto navy y no blanco: el azul cielo es un fondo claro y el
 * blanco encima da 2.2:1 de contraste, muy por debajo del 4.5:1 que exige
 * WCAG AA. Con navy sube a 5.6:1 y el fondo sigue siendo el del diseño.
 */
export const BADGE: Record<
  CategoriaClasificado,
  { fondo: string; texto: string }
> = {
  COMPRO: { fondo: 'var(--li-navy)', texto: 'var(--li-white)' },
  VENDO: { fondo: 'var(--li-red)', texto: 'var(--li-white)' },
  OFREZCO: { fondo: 'var(--li-sky)', texto: 'var(--li-navy)' },
};
