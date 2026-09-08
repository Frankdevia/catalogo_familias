/**
 * Abre el visor de foto desde cualquier sitio que lo pida.
 *
 * Quien quiera abrirlo solo tiene que poner `data-visor="<url>"` en un botón,
 * con `data-visor-alt` para el texto alternativo. Así lo usan la ficha —que lo
 * marca al compilar— y la ventana del negocio —que lo rellena en el cliente,
 * porque el diálogo es uno solo y se reutiliza para las 52 fichas—.
 *
 * La imagen se asigna al pulsar, nunca antes: es una variante grande y no tiene
 * sentido descargar 52 de ellas para las que nadie va a mirar.
 */

const visor = document.querySelector<HTMLDialogElement>('#visor-foto');
const imagen = document.querySelector<HTMLImageElement>('#visor-imagen');

if (visor && imagen) {
  /** Se llama también desde `catalogo.ts`, que abre el visor sobre la ventana. */
  function abrir(url: string, alt: string): void {
    if (!visor || !imagen) return;
    // Se limpia primero: asignar `src` no borra la imagen anterior, y el visor
    // es único. Sin esto se vería un instante la foto del negocio anterior,
    // que es el mismo fallo que ya se corrigió en la ventana.
    imagen.removeAttribute('src');
    imagen.src = url;
    imagen.alt = alt;
    visor.showModal();
  }

  // Se expone para que `catalogo.ts` lo use sin duplicar la lógica ni tener que
  // importar entre dos scripts que Astro empaqueta por separado.
  (window as unknown as { abrirVisor?: typeof abrir }).abrirVisor = abrir;

  document.addEventListener('click', (evento) => {
    const disparador = (evento.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-visor]',
    );
    if (!disparador) return;
    const url = disparador.dataset.visor;
    if (!url) return;
    evento.preventDefault();
    abrir(url, disparador.dataset.visorAlt ?? '');
  });

  document.querySelector('#visor-cerrar')?.addEventListener('click', () => visor.close());

  // Clic en el fondo: como la imagen está centrada dentro del propio <dialog>,
  // cualquier punto que no sea la imagen o el botón es «fuera».
  visor.addEventListener('click', (evento) => {
    if (evento.target === visor) visor.close();
  });

  // Al cerrar se suelta la imagen: una foto de 1600px retenida en memoria por
  // cada visita no le sirve a nadie.
  visor.addEventListener('close', () => {
    imagen.removeAttribute('src');
    imagen.alt = '';
  });
}
