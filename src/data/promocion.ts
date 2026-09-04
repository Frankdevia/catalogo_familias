import type { CollectionEntry } from 'astro:content';

export type Promocion = CollectionEntry<'promociones'>;

/**
 * Hoy en Bogotá, en AAAA-MM-DD.
 *
 * Se calcula sobre la zona del colegio y no sobre la del servidor: una
 * promoción que vence hoy tiene que seguir viéndose hasta el final del día
 * aquí, no hasta la medianoche de otro continente.
 */
export function hoyEnBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Una promoción cuya vigencia ya pasó. El cron las retira, pero el sitio se
 *  construye cada tanto: esto evita enseñar una caducada entre medias. */
export function estaVigente(p: Promocion, hoy = hoyEnBogota()): boolean {
  return p.data.hasta >= hoy && p.data.desde <= hoy;
}

/**
 * Primero lo que está a punto de vencer.
 *
 * Es lo contrario a lo habitual —lo más nuevo arriba— y es a propósito: en una
 * promoción, lo urgente es lo que se acaba, no lo que acaba de llegar.
 */
export function ordenarPromociones(promos: Promocion[]): Promocion[] {
  return [...promos].sort(
    (a, b) => a.data.hasta.localeCompare(b.data.hasta) || a.data.titulo.localeCompare(b.data.titulo, 'es'),
  );
}

/** "2026-10-01" -> "1 de octubre". El año solo si no es el actual. */
export function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  const esteAno = new Date().getFullYear() === a;
  return fecha.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    ...(esteAno ? {} : { year: 'numeric' }),
  });
}

/** Cuántos días quedan. Negativo si ya pasó. */
export function diasRestantes(hasta: string, hoy = hoyEnBogota()): number {
  const ms = new Date(hasta).getTime() - new Date(hoy).getTime();
  return Math.round(ms / 86_400_000);
}
