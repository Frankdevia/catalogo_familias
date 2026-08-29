import {
  FOTO,
  CAMPO_TRAMPA,
  normalizarTelefono,
  normalizarWeb,
  normalizarInstagram,
} from '../data/registro';

const form = document.querySelector<HTMLFormElement>('#form-negocio');
const exito = document.querySelector<HTMLElement>('#exito');

if (form && exito) {
  const endpoint = form.dataset.endpoint ?? '';
  const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const estado = form.querySelector<HTMLElement>('[data-estado]')!;
  const inputFoto = form.querySelector<HTMLInputElement>('#foto')!;
  const previsualizacion = form.querySelector<HTMLElement>('.previsualizacion')!;
  const imgPrevia = previsualizacion.querySelector('img')!;
  const pesoFoto = previsualizacion.querySelector<HTMLElement>('[data-peso-foto]')!;
  const descripcion = form.querySelector<HTMLTextAreaElement>('#descripcion')!;
  const contador = form.querySelector<HTMLElement>('#contador-descripcion')!;

  /** La foto ya comprimida. Se calcula al elegirla, no al enviar, para que la
   *  espera ocurra mientras la persona sigue llenando el resto. */
  let fotoLista: Blob | null = null;

  /* ---------------------------------------------------------------- *
   * Errores por campo
   * ---------------------------------------------------------------- */

  function mostrarError(campo: string, mensaje: string): void {
    const p = form!.querySelector<HTMLElement>(`[data-error-de="${campo}"]`);
    const input = form!.elements.namedItem(campo);
    if (p) {
      p.textContent = mensaje;
      p.hidden = false;
    }
    if (input instanceof HTMLElement) input.setAttribute('aria-invalid', 'true');
  }

  function limpiarErrores(): void {
    for (const p of form!.querySelectorAll<HTMLElement>('[data-error-de]')) {
      p.textContent = '';
      p.hidden = true;
    }
    for (const el of form!.querySelectorAll('[aria-invalid]')) {
      el.removeAttribute('aria-invalid');
    }
  }

  function avisar(mensaje: string, esError: boolean): void {
    estado.textContent = mensaje;
    estado.hidden = false;
    estado.classList.toggle('aviso--error', esError);
  }

  /* ---------------------------------------------------------------- *
   * Foto: previsualizar y comprimir
   * ---------------------------------------------------------------- */

  function pesoLegible(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Redimensiona a `FOTO.anchoMaximo` y re-codifica. Una foto de celular de
   * 12 MB queda en ~200 KB, que es la diferencia entre que el envío funcione
   * con datos móviles y que se caiga por tiempo de espera.
   *
   * Si el navegador no sabe decodificar el formato (HEIC en Android, por
   * ejemplo), devuelve el archivo original y deja que n8n lo convierta.
   */
  async function comprimir(archivo: File): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      if (archivo.size > FOTO.maxBytesOriginal) {
        throw new Error(
          `No pudimos procesar esa imagen y pesa ${pesoLegible(archivo.size)}. ` +
            'Intenta con una foto más liviana o en formato JPG.',
        );
      }
      return archivo;
    }

    const escala = Math.min(1, FOTO.anchoMaximo / bitmap.width);
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return archivo;
    }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const codificar = (tipo: string) =>
      new Promise<Blob | null>((res) => lienzo.toBlob(res, tipo, FOTO.calidad));

    const blob = (await codificar('image/webp')) ?? (await codificar('image/jpeg'));
    if (!blob) return archivo;

    // Si comprimir no ayudó (imágenes ya pequeñas), se queda el original.
    return blob.size < archivo.size ? blob : archivo;
  }

  inputFoto.addEventListener('change', async () => {
    const archivo = inputFoto.files?.[0];
    fotoLista = null;
    previsualizacion.hidden = true;
    limpiarErrores();

    if (!archivo) return;

    if (archivo.size > FOTO.maxBytesOriginal) {
      mostrarError(
        'foto',
        `La foto pesa ${pesoLegible(archivo.size)} y el máximo es ${pesoLegible(FOTO.maxBytesOriginal)}.`,
      );
      return;
    }

    pesoFoto.textContent = 'Preparando la foto…';
    previsualizacion.hidden = false;

    try {
      const comprimida = await comprimir(archivo);
      fotoLista = comprimida;
      imgPrevia.src = URL.createObjectURL(comprimida);
      pesoFoto.textContent =
        comprimida.size < archivo.size
          ? `Lista: ${pesoLegible(archivo.size)} → ${pesoLegible(comprimida.size)}`
          : `Lista: ${pesoLegible(comprimida.size)}`;
    } catch (error) {
      previsualizacion.hidden = true;
      mostrarError('foto', error instanceof Error ? error.message : 'No pudimos leer esa imagen.');
    }
  });

  /* ---------------------------------------------------------------- *
   * Contador de la descripción
   * ---------------------------------------------------------------- */

  const maximoDescripcion = Number(descripcion.getAttribute('maxlength') ?? 200);
  const actualizarContador = () => {
    contador.textContent = `${descripcion.value.length} de ${maximoDescripcion} caracteres`;
  };
  descripcion.addEventListener('input', actualizarContador);
  actualizarContador();

  /* ---------------------------------------------------------------- *
   * Validación y envío
   * ---------------------------------------------------------------- */

  function validar(): boolean {
    limpiarErrores();
    let primerFallo: HTMLElement | null = null;

    const fallar = (campo: string, mensaje: string) => {
      mostrarError(campo, mensaje);
      const el = form!.elements.namedItem(campo);
      if (!primerFallo && el instanceof HTMLElement) primerFallo = el;
    };

    const obligatorios: Array<[string, string]> = [
      ['codigo_familia', 'Necesitamos tu código de familia.'],
      ['acudiente_nombre', 'Escribe tu nombre.'],
      ['acudiente_telefono', 'Escribe tu teléfono.'],
      ['acudiente_correo', 'Escribe tu correo.'],
      ['negocio_nombre', 'Ponle nombre a tu negocio.'],
      ['categoria', 'Elige una categoría.'],
      ['descripcion', 'Cuéntanos qué ofreces.'],
      ['negocio_telefono', 'Escribe el teléfono del negocio.'],
      ['direccion', 'Escribe la dirección o la ciudad.'],
    ];

    for (const [campo, mensaje] of obligatorios) {
      const el = form!.elements.namedItem(campo) as HTMLInputElement | HTMLSelectElement | null;
      if (!el?.value.trim()) fallar(campo, mensaje);
    }

    for (const campo of ['acudiente_telefono', 'negocio_telefono']) {
      const el = form!.elements.namedItem(campo) as HTMLInputElement | null;
      const valor = normalizarTelefono(el?.value ?? '');
      if (el?.value.trim() && valor.replace(/\s/g, '').length < 7) {
        fallar(campo, 'Ese teléfono parece incompleto.');
      }
    }

    const correo = form!.elements.namedItem('acudiente_correo') as HTMLInputElement;
    if (correo.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value.trim())) {
      fallar('acudiente_correo', 'Revisa el correo, parece incompleto.');
    }

    if (!fotoLista) fallar('foto', 'Sube una foto de tu negocio.');

    const consentimiento = form!.elements.namedItem('consentimiento') as HTMLInputElement;
    if (!consentimiento.checked) {
      fallar('consentimiento', 'Necesitamos tu autorización para publicar el negocio.');
    }

    if (primerFallo) {
      (primerFallo as HTMLElement).focus();
      avisar('Revisa los campos marcados.', true);
      return false;
    }
    return true;
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!endpoint) return;
    if (!validar()) return;

    const valor = (campo: string) =>
      ((form.elements.namedItem(campo) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '').trim();

    const datos = new FormData();
    datos.set('codigo_familia', valor('codigo_familia'));
    datos.set('acudiente_nombre', valor('acudiente_nombre'));
    datos.set('acudiente_telefono', normalizarTelefono(valor('acudiente_telefono')));
    datos.set('acudiente_correo', valor('acudiente_correo').toLowerCase());
    datos.set('negocio_nombre', valor('negocio_nombre'));
    datos.set('categoria', valor('categoria'));
    datos.set('descripcion', valor('descripcion'));
    datos.set('negocio_telefono', normalizarTelefono(valor('negocio_telefono')));
    datos.set('direccion', valor('direccion'));
    datos.set('web', normalizarWeb(valor('web')));
    datos.set('instagram', normalizarInstagram(valor('instagram')));
    datos.set('facebook', valor('facebook'));
    datos.set('consentimiento', 'si');
    datos.set(CAMPO_TRAMPA, valor(CAMPO_TRAMPA));
    datos.set('foto', fotoLista!, `negocio.${fotoLista!.type === 'image/webp' ? 'webp' : 'jpg'}`);

    boton.disabled = true;
    avisar('Enviando tu solicitud…', false);

    try {
      const respuesta = await fetch(endpoint, { method: 'POST', body: datos });
      // Un webhook puede responder texto plano si algo falla antes del último nodo.
      const cuerpo = await respuesta.json().catch(() => null);

      if (respuesta.ok && cuerpo?.ok) {
        form.hidden = true;
        exito.hidden = false;
        exito.scrollIntoView({ block: 'center' });
        return;
      }

      // El servidor puede señalar qué campo falló (p. ej. un código inexistente).
      if (cuerpo?.campo) {
        mostrarError(cuerpo.campo, cuerpo.mensaje ?? 'Revisa este dato.');
        const el = form.elements.namedItem(cuerpo.campo);
        if (el instanceof HTMLElement) el.focus();
      }
      avisar(
        cuerpo?.mensaje ?? 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.',
        true,
      );
    } catch {
      avisar(
        'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.',
        true,
      );
    } finally {
      boton.disabled = false;
    }
  });
}
