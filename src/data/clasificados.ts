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
/**
 * El orden es el de los chips del filtro: primero lo que se pide —COMPRO,
 * BUSCO— y después lo que se ofrece —VENDO, OFREZCO—.
 *
 * COMPRO y BUSCO se parecen pero no son lo mismo: COMPRO es una compra, algo
 * que cambia de dueño por dinero; BUSCO es todo lo demás que hace falta y no se
 * compra —un arriendo, un cupo en una ruta, alguien que dé un refuerzo, un
 * trabajo—. Es la contraparte de OFREZCO igual que COMPRO lo es de VENDO.
 */
export const CATEGORIAS_CLASIFICADOS = [
  'COMPRO',
  'BUSCO',
  'VENDO',
  'OFREZCO',
] as const;

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
  /* El amarillo es el cuarto color de marca y el único que quedaba libre. Como
     el cielo, es un fondo claro: lleva texto navy, no blanco. */
  BUSCO: { fondo: 'var(--li-yellow)', texto: 'var(--li-navy)' },
  VENDO: { fondo: 'var(--li-red)', texto: 'var(--li-white)' },
  OFREZCO: { fondo: 'var(--li-sky)', texto: 'var(--li-navy)' },
};
