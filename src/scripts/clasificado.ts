import { CAMPO_TRAMPA, normalizarTelefono } from '../data/registro';

const form = document.querySelector<HTMLFormElement>('#form-clasificado');
const exito = document.querySelector<HTMLElement>('#exito');

if (form && exito) {
  const endpoint = form.dataset.endpoint ?? '';
  const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const estado = form.querySelector<HTMLElement>('[data-estado]')!;
  const desc = form.querySelector<HTMLTextAreaElement>('#desc')!;
  const contador = form.querySelector<HTMLElement>('#contador-desc')!;

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

  const maximo = Number(desc.getAttribute('maxlength') ?? 280);
  const actualizarContador = () => {
    contador.textContent = `${desc.value.length} de ${maximo} caracteres`;
  };
  desc.addEventListener('input', actualizarContador);
  actualizarContador();

  function validar(): boolean {
    limpiarErrores();
    let primerFallo: HTMLElement | null = null;

    const fallar = (campo: string, mensaje: string) => {
      mostrarError(campo, mensaje);
      const el = form!.elements.namedItem(campo);
      if (!primerFallo && el instanceof HTMLElement) primerFallo = el;
    };

    const obligatorios: Array<[string, string]> = [
      ['estudiantes', 'Escribe los nombres de tus estudiantes y su grado.'],
      ['acudiente_nombre', 'Escribe tu nombre.'],
      ['cat', 'Elige qué quieres publicar.'],
      ['desc', 'Escribe tu anuncio.'],
      ['phone', 'Escribe un teléfono de contacto.'],
      ['email', 'Escribe un correo de contacto.'],
    ];

    for (const [campo, mensaje] of obligatorios) {
      const el = form!.elements.namedItem(campo) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      if (!el?.value.trim()) fallar(campo, mensaje);
    }

    const tel = form!.elements.namedItem('phone') as HTMLInputElement;
    if (tel.value.trim() && normalizarTelefono(tel.value).replace(/\s/g, '').length < 7) {
      fallar('phone', 'Ese teléfono parece incompleto.');
    }

    const correo = form!.elements.namedItem('email') as HTMLInputElement;
    if (correo.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value.trim())) {
      fallar('email', 'Revisa el correo, parece incompleto.');
    }

    const consentimiento = form!.elements.namedItem('consentimiento') as HTMLInputElement;
    if (!consentimiento.checked) {
      fallar('consentimiento', 'Necesitamos tu autorización para publicar el anuncio.');
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
      (
        (form.elements.namedItem(campo) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | null)?.value ?? ''
      ).trim();

    const datos = new URLSearchParams();
    datos.set('estudiantes', valor('estudiantes'));
    datos.set('acudiente_nombre', valor('acudiente_nombre'));
    datos.set('cat', valor('cat'));
    datos.set('desc', valor('desc'));
    datos.set('phone', normalizarTelefono(valor('phone')));
    datos.set('email', valor('email').toLowerCase());
    datos.set('consentimiento', 'si');
    datos.set(CAMPO_TRAMPA, valor(CAMPO_TRAMPA));

    boton.disabled = true;
    avisar('Enviando tu anuncio…', false);

    try {
      // Sin foto no hace falta multipart: un form-urlencoded basta y evita el
      // preflight de CORS, igual que el FormData del otro formulario.
      const respuesta = await fetch(endpoint, { method: 'POST', body: datos });
      const cuerpo = await respuesta.json().catch(() => null);

      if (respuesta.ok && cuerpo?.ok) {
        form.hidden = true;
        exito.hidden = false;
        exito.scrollIntoView({ block: 'center' });
        return;
      }

      if (cuerpo?.campo) {
        mostrarError(cuerpo.campo, cuerpo.mensaje ?? 'Revisa este dato.');
        const el = form.elements.namedItem(cuerpo.campo);
        if (el instanceof HTMLElement) el.focus();
      }
      avisar(
        cuerpo?.mensaje ??
          'No pudimos registrar tu anuncio. Inténtalo de nuevo en unos minutos.',
        true,
      );
    } catch {
      avisar('No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.', true);
    } finally {
      boton.disabled = false;
    }
  });
}
