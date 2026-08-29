import type { NegocioModal } from './tipos';

const TODOS = 'Todos';

/* ------------------------------------------------------------------ *
 * Filtro por categoría
 * ------------------------------------------------------------------ */

const chips = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-filtro]'),
);
const tarjetas = Array.from(
  document.querySelectorAll<HTMLElement>('[data-negocio]'),
);
const conteo = document.getElementById('catalogo-conteo');
const vacio = document.getElementById('catalogo-vacio');

/** Aplica el filtro sin tocar la URL. Devuelve cuántos quedaron visibles. */
function aplicarFiltro(categoria: string): number {
  let visibles = 0;
  for (const tarjeta of tarjetas) {
    const coincide = categoria === TODOS || tarjeta.dataset.categoria === categoria;
    tarjeta.hidden = !coincide;
    if (coincide) visibles++;
  }

  for (const chip of chips) {
    chip.setAttribute(
      'aria-pressed',
      String(chip.dataset.filtro === categoria),
    );
  }

  if (conteo) {
    conteo.textContent =
      visibles === 1 ? '1 negocio' : `${visibles} negocios`;
  }
  if (vacio) vacio.hidden = visibles > 0;

  return visibles;
}

/** Refleja el filtro en la URL para que se pueda compartir o recargar. */
function sincronizarUrl(categoria: string): void {
  const url = new URL(window.location.href);
  if (categoria === TODOS) {
    url.searchParams.delete('cat');
  } else {
    url.searchParams.set('cat', categoria);
  }
  window.history.replaceState(null, '', url);
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    const categoria = chip.dataset.filtro ?? TODOS;
    aplicarFiltro(categoria);
    sincronizarUrl(categoria);
  });
}

// Estado inicial desde la URL. Una categoría desconocida cae en "Todos".
if (chips.length > 0) {
  const pedida = new URL(window.location.href).searchParams.get('cat');
  const valida = pedida && chips.some((c) => c.dataset.filtro === pedida);
  aplicarFiltro(valida ? (pedida as string) : TODOS);
}

/* ------------------------------------------------------------------ *
 * Modal de detalle
 * ------------------------------------------------------------------ */

const modal = document.querySelector<HTMLDialogElement>('#modal-negocio');
const datosCrudos = document.getElementById('negocios-datos')?.textContent;

if (modal && datosCrudos) {
  const negocios: Record<string, NegocioModal> = Object.fromEntries(
    (JSON.parse(datosCrudos) as NegocioModal[]).map((n) => [n.slug, n]),
  );

  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T | null;

  const foto = el<HTMLImageElement>('modal-foto');
  const categoria = el('modal-categoria');
  const familia = el('modal-familia');
  const nombre = el('modal-nombre');
  const descripcion = el('modal-descripcion');
  const datos = el('modal-datos');
  const llamar = el<HTMLAnchorElement>('modal-llamar');
  const ficha = el<HTMLAnchorElement>('modal-ficha');

  /** Construye una fila <dt>/<dd>. `href` la convierte en enlace. */
  function fila(etiqueta: string, valor: string, href?: string): HTMLDivElement {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = valor;
      if (href.startsWith('http')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      dd.appendChild(a);
    } else {
      dd.textContent = valor;
    }
    div.append(dt, dd);
    return div;
  }

  function abrir(slug: string): void {
    const n = negocios[slug];
    if (!n || !modal) return;

    if (foto) {
      foto.src = n.foto;
      foto.alt = `Foto de ${n.nombre}`;
    }
    if (categoria) categoria.textContent = n.categoria;
    if (familia) familia.textContent = n.familia;
    if (nombre) nombre.textContent = n.nombre;
    if (descripcion) descripcion.textContent = n.descripcion;

    if (datos) {
      datos.replaceChildren(
        fila('Teléfono', n.telefono, n.telHref),
        fila('Dirección', n.direccion),
        ...(n.web ? [fila('Página web', n.web, n.webHref)] : []),
        ...(n.instagram ? [fila('Instagram', n.instagram, n.instagramHref)] : []),
        ...(n.facebook ? [fila('Facebook', n.facebook)] : []),
      );
    }

    if (llamar) llamar.href = n.telHref;
    if (ficha) ficha.href = n.ficha;

    modal.showModal();
  }

  document.addEventListener('click', (evento) => {
    const disparador = (evento.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-abrir]',
    );
    if (!disparador) return;
    const slug = disparador.dataset.abrir;
    if (!slug || !negocios[slug]) return; // sin datos, deja pasar el enlace
    evento.preventDefault();
    abrir(slug);
  });

  el('modal-cerrar')?.addEventListener('click', () => modal.close());

  // Clic sobre el ::backdrop: el target es el propio <dialog>.
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.close();
  });
}
