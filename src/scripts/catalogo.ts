import type { NegocioModal } from './tipos';
import { montarFiltro } from './filtro';

/* ------------------------------------------------------------------ *
 * Filtro por categoría
 * ------------------------------------------------------------------ */

const seccionCatalogo = document.querySelector<HTMLElement>('#catalogo');
if (seccionCatalogo) {
  montarFiltro({
    raiz: seccionCatalogo,
    atributoItem: 'data-negocio',
    paramUrl: 'cat',
    conteo: document.getElementById('catalogo-conteo'),
    vacio: document.getElementById('catalogo-vacio'),
    singular: 'negocio',
    plural: 'negocios',
  });
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

    // Sin foto se oculta el hueco en vez de dejar una imagen rota. En el modal
    // no cabe el respaldo con la inicial que usan la tarjeta y la ficha: aquí
    // la imagen es la cabecera del diálogo y quitarla no descuadra nada.
    if (foto) {
      const hayFoto = Boolean(n.foto);
      foto.hidden = !hayFoto;
      if (hayFoto) {
        foto.src = n.foto!;
        foto.alt = `Foto de ${n.nombre}`;
      } else {
        foto.removeAttribute('src');
        foto.alt = '';
      }
    }
    if (categoria) categoria.textContent = n.categoria;
    if (familia) familia.textContent = n.familia;
    if (nombre) nombre.textContent = n.nombre;
    if (descripcion) descripcion.textContent = n.descripcion;

    if (datos) {
      datos.replaceChildren(
        fila('Teléfono', n.telefono, n.telHref),
        ...(n.direccion ? [fila('Dirección', n.direccion)] : []),
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
