import type { CollectionEntry } from 'astro:content';
import { SITIO } from './sitio';

export type Clasificado = CollectionEntry<'clasificados'>;

/** "311 222 3344" -> "tel:+573112223344" */
export function telHref(telefono: string): string {
  return `tel:${SITIO.indicativo}${telefono.replace(/\s/g, '')}`;
}

/** Los más nuevos primero; a igualdad de fecha, orden estable por id. */
export function ordenarClasificados(anuncios: Clasificado[]): Clasificado[] {
  return [...anuncios].sort(
    (a, b) =>
      b.data.publicado.localeCompare(a.data.publicado) || a.id.localeCompare(b.id),
  );
}
