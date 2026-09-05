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

  /*
   * Qué ficha se está abriendo ahora mismo.
   *
   * `decode()` tarda lo que tarde, y dos clics seguidos lo lanzan dos veces. Sin
   * este testigo, la que acabe primero es la que se enseña, aunque sea la que ya
   * no quieres ver.
   */
  let abriendo: string | null = null;

  function abrir(slug: string): void {
    const n = negocios[slug];
    if (!n || !modal) return;
    abriendo = slug;

    // Sin foto se oculta el hueco en vez de dejar una imagen rota. En el modal
    // no cabe el respaldo con la inicial que usan la tarjeta y la ficha: aquí
    // la imagen es la cabecera del diálogo y quitarla no descuadra nada.
    if (foto) {
      const hayFoto = Boolean(n.foto);
      foto.hidden = !hayFoto;

      // El encaje y el color van SIEMPRE y van PRIMERO. El diálogo es uno solo
      // y se reutiliza: si no se limpian, la siguiente ficha hereda el fondo de
      // la anterior.
      const cabecera = foto.parentElement;
      if (cabecera) {
        cabecera.dataset.encaje = n.encaje ?? 'cubrir';
        cabecera.style.setProperty('--fondo-foto', n.fondo ?? '');
      }

      if (hayFoto) {
        /*
         * Ocultar antes de asignar el `src`.
         *
         * Asignar `src` NO borra la imagen: el navegador sigue pintando los
         * píxeles anteriores hasta decodificar los nuevos. Como el diálogo se
         * reutiliza, eso significaba ver el negocio anterior entre 121 y 495 ms
         * en cada apertura.
         *
         * Mientras está oculta se ve el color de la banda, que en un logo es su
         * propio fondo: parece que la imagen aparece, no que se cambia. Con la
         * foto en caché —lo normal, es la misma que la tarjeta— esto dura un
         * fotograma y no se nota.
         */
        foto.style.visibility = 'hidden';
        foto.src = n.foto!;
        foto.alt = `Foto de ${n.nombre}`;
        // Las medidas reales, no las fijas del HTML: una foto contenida no mide
        // 1040x400, y declararlo era metadato falso.
        if (n.fotoAncho && n.fotoAlto) {
          foto.width = n.fotoAncho;
          foto.height = n.fotoAlto;
        }

        const mostrar = () => {
          // Si entretanto se abrió otra ficha, esta ya no manda.
          if (abriendo === slug) foto.style.visibility = '';
        };
        // `decode()` rechaza si el `src` cambia a mitad; da igual, el testigo ya
        // decide quién gana. Y si el navegador no lo trae, se enseña sin más.
        if (typeof foto.decode === 'function') foto.decode().then(mostrar, mostrar);
        else mostrar();
      } else {
        foto.removeAttribute('src');
        foto.alt = '';
        foto.style.visibility = '';
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
