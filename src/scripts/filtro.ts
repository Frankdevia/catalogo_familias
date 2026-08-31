/**
 * Filtro por categoría reutilizable.
 *
 * Nació dentro de `catalogo.ts`, donde consultaba `[data-filtro]` y
 * `[data-negocio]` sobre TODO el documento. Con una segunda sección filtrable
 * en la misma página (los clasificados) eso rompía los dos filtros a la vez:
 * cada grupo de píldoras encontraba también las tarjetas del otro.
 *
 * Por eso todo aquí cuelga de una raíz y cada instancia usa su propio
 * parámetro de URL.
 */

export const TODOS = 'Todos';

interface Opciones {
  /** Acota las consultas a esta sección. */
  raiz: HTMLElement;
  /** Atributo que marca cada tarjeta: 'data-negocio' | 'data-anuncio'. */
  atributoItem: string;
  /** Parámetro de URL propio, para que dos filtros puedan convivir. */
  paramUrl: string;
  /** Región `aria-live` con el conteo. */
  conteo?: HTMLElement | null;
  /** Mensaje que se muestra cuando no queda ninguna tarjeta visible. */
  vacio?: HTMLElement | null;
  /** Para el texto del conteo: "1 negocio" / "3 negocios". */
  singular: string;
  plural: string;
}

export function montarFiltro(op: Opciones): void {
  const chips = Array.from(
    op.raiz.querySelectorAll<HTMLButtonElement>('[data-filtro]'),
  );
  const tarjetas = Array.from(
    op.raiz.querySelectorAll<HTMLElement>(`[${op.atributoItem}]`),
  );
  if (chips.length === 0) return;

  /** Aplica el filtro sin tocar la URL. */
  function aplicar(categoria: string): void {
    let visibles = 0;
    for (const tarjeta of tarjetas) {
      const coincide =
        categoria === TODOS || tarjeta.dataset.categoria === categoria;
      tarjeta.hidden = !coincide;
      if (coincide) visibles++;
    }

    // El estado activo se marca con aria-pressed: así lo visual y lo que
    // anuncia el lector de pantalla no pueden desincronizarse.
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filtro === categoria));
    }

    if (op.conteo) {
      op.conteo.textContent =
        visibles === 1 ? `1 ${op.singular}` : `${visibles} ${op.plural}`;
    }
    if (op.vacio) op.vacio.hidden = visibles > 0;
  }

  /** Refleja el filtro en la URL para poder compartirlo o recargar. */
  function sincronizarUrl(categoria: string): void {
    const url = new URL(window.location.href);
    if (categoria === TODOS) {
      url.searchParams.delete(op.paramUrl);
    } else {
      url.searchParams.set(op.paramUrl, categoria);
    }
    window.history.replaceState(null, '', url);
  }

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const categoria = chip.dataset.filtro ?? TODOS;
      aplicar(categoria);
      sincronizarUrl(categoria);
    });
  }

  // Estado inicial desde la URL. Un valor desconocido cae en "Todos".
  const pedida = new URL(window.location.href).searchParams.get(op.paramUrl);
  const valida = pedida && chips.some((c) => c.dataset.filtro === pedida);
  aplicar(valida ? (pedida as string) : TODOS);
}
