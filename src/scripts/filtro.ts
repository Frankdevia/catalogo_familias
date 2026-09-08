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
  /** Campo de búsqueda libre. Opcional: los clasificados no lo tienen. */
  busqueda?: HTMLInputElement | null;
  /** Se rellena con lo buscado cuando no hay resultados. */
  terminoVacio?: HTMLElement | null;
}

/** Sin tildes y en minúsculas, igual que el `data-busca` de cada tarjeta. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function montarFiltro(op: Opciones): void {
  const chips = Array.from(
    op.raiz.querySelectorAll<HTMLButtonElement>('[data-filtro]'),
  );
  const tarjetas = Array.from(
    op.raiz.querySelectorAll<HTMLElement>(`[${op.atributoItem}]`),
  );
  if (chips.length === 0) return;

  // Los dos filtros se guardan aquí y se aplican JUNTOS. Si cada uno escondiera
  // y mostrara por su cuenta, el último en ejecutarse desharía al otro: buscar
  // algo devolvería tarjetas de categorías que estaban filtradas.
  let categoriaActual = TODOS;
  let terminoActual = '';

  /** Aplica los dos filtros a la vez, sin tocar la URL. */
  function aplicar(categoria = categoriaActual, termino = terminoActual): void {
    categoriaActual = categoria;
    terminoActual = termino;

    // Cada palabra por separado y todas tienen que estar: «cafe pereira»
    // encuentra el café de Pereira aunque las dos palabras estén lejos.
    const palabras = termino.split(/\s+/).filter(Boolean);

    let visibles = 0;
    for (const tarjeta of tarjetas) {
      const deCategoria =
        categoria === TODOS || tarjeta.dataset.categoria === categoria;
      const texto = tarjeta.dataset.busca ?? '';
      const coincide = deCategoria && palabras.every((p) => texto.includes(p));
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
    if (op.terminoVacio) op.terminoVacio.textContent = termino;
    // El mensaje de «no hay nada» cambia según por qué no hay nada.
    if (op.vacio) op.vacio.dataset.motivo = termino ? 'busqueda' : 'categoria';
  }

  /** Refleja los filtros en la URL para poder compartirlos o recargar. */
  function sincronizarUrl(): void {
    const url = new URL(window.location.href);
    if (categoriaActual === TODOS) url.searchParams.delete(op.paramUrl);
    else url.searchParams.set(op.paramUrl, categoriaActual);

    if (!terminoActual) url.searchParams.delete(`${op.paramUrl}-q`);
    else url.searchParams.set(`${op.paramUrl}-q`, terminoActual);

    window.history.replaceState(null, '', url);
  }

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      aplicar(chip.dataset.filtro ?? TODOS);
      sincronizarUrl();
    });
  }

  if (op.busqueda) {
    const campo = op.busqueda;
    // `input` y no `keyup`: también recoge pegar, dictar y la «x» de limpiar
    // que el propio navegador dibuja en un type="search".
    campo.addEventListener('input', () => {
      aplicar(categoriaActual, normalizar(campo.value));
      sincronizarUrl();
    });
    // En un formulario suelto, Enter recargaría la página y perdería el filtro.
    campo.form?.addEventListener('submit', (e) => e.preventDefault());
  }

  // Estado inicial desde la URL. Un valor desconocido cae en "Todos".
  const parametros = new URL(window.location.href).searchParams;
  const pedida = parametros.get(op.paramUrl);
  const valida = pedida && chips.some((c) => c.dataset.filtro === pedida);
  const buscado = normalizar(parametros.get(`${op.paramUrl}-q`) ?? '');
  if (op.busqueda && buscado) op.busqueda.value = buscado;
  aplicar(valida ? (pedida as string) : TODOS, buscado);
}
