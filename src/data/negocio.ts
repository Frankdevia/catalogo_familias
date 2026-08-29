import type { CollectionEntry } from 'astro:content';
import { SITIO } from './sitio';

export type Negocio = CollectionEntry<'negocios'>;

/** "310 456 7890" -> "tel:+573104567890" */
export function telHref(telefono: string): string {
  return `tel:${SITIO.indicativo}${telefono.replace(/\s/g, '')}`;
}

/** "cafecerritos.co" -> "https://cafecerritos.co" */
export function webHref(web: string): string {
  return /^https?:\/\//.test(web) ? web : `https://${web}`;
}

/** "@cafe.cerritos" -> "https://instagram.com/cafe.cerritos" */
export function instagramHref(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}

/** Orden de la grilla: por `orden`, y a igualdad por nombre. */
export function ordenarNegocios(negocios: Negocio[]): Negocio[] {
  return [...negocios].sort(
    (a, b) =>
      a.data.orden - b.data.orden || a.data.nombre.localeCompare(b.data.nombre, 'es'),
  );
}

/**
 * Ancho a pedirle a astro:assets, nunca mayor que el original.
 * Sin esto, una foto de 640px pedida a 1040px se reescala hacia arriba:
 * pesa más y no gana un solo píxel de detalle.
 */
export function anchoSeguro(foto: { width: number }, deseado: number): number {
  return Math.min(deseado, foto.width);
}
