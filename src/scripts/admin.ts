import { crearCliente, resolverSesion } from '../lib/supabase';

/**
 * Panel de revisión.
 *
 * El guardián de verdad no está aquí sino en las políticas de la base. Este
 * script decide qué pintar; si alguien lo manipula desde su navegador, lo único
 * que consigue es ver un panel vacío, porque las consultas seguirían sin
 * devolver filas.
 */

type Cola = 'negocios' | 'clasificados' | 'promociones';
type Estado = 'pendiente' | 'aprobado' | 'retirado' | 'rechazado';
type Fila = Record<string, any>;

const TABLA: Record<Cola, string> = {
  negocios: 'solicitudes_negocios',
  clasificados: 'solicitudes_clasificados',
  promociones: 'solicitudes_promociones',
};

const raiz = document.getElementById('panel');

if (raiz) {
  const db = crearCliente(raiz.dataset.supabaseUrl ?? '', raiz.dataset.supabaseClave ?? '');
  let usuarioId = '';
  let cola: Cola = 'negocios';
  let estado: Estado = 'pendiente';
  /** Todo lo leído, por cola. Se recarga entero tras cada acción. */
  const datos: Record<Cola, Fila[]> = { negocios: [], clasificados: [], promociones: [] };

  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel);
  const vista = (nombre: string) => {
    for (const s of raiz.querySelectorAll<HTMLElement>('[data-vista]')) {
      s.hidden = s.dataset.vista !== nombre;
    }
  };

  const avisar = (mensaje: string, tono: 'info' | 'error' = 'info') => {
    const p = $('[data-aviso]');
    if (!p) return;
    p.textContent = mensaje;
    p.dataset.tono = tono;
    p.hidden = !mensaje;
  };

  const escapar = (v: unknown) =>
    String(v ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // --- lectura -------------------------------------------------------------

  async function cargar() {
    const peticiones = (Object.keys(TABLA) as Cola[]).map(async (c) => {
      const { data, error } = await db
        .from(TABLA[c])
        .select('*')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      datos[c] = data ?? [];
    });
    await Promise.all(peticiones);

    // El contador de cada pestaña muestra lo PENDIENTE, que es lo que reclama
    // atención; los otros estados se consultan entrando.
    for (const c of Object.keys(TABLA) as Cola[]) {
      const n = datos[c].filter((f) => f.estado === 'pendiente').length;
      const donde = $(`[data-cuenta="${c}"]`);
      if (donde) donde.textContent = String(n);
    }
  }

  /**
   * URL temporal para ver una foto que todavía está en el bucket privado.
   * Se pide una por tarjeta y solo cuando se va a pintar: firmar todas de
   * entrada sería trabajo tirado en cuanto haya cien pendientes.
   */
  async function urlFoto(ruta: string | null): Promise<string | null> {
    if (!ruta) return null;
    const { data } = await db.storage.from('fotos').createSignedUrl(ruta, 3600);
    return data?.signedUrl ?? null;
  }

  // --- pintado -------------------------------------------------------------

  function camposDe(f: Fila): Array<[string, string, boolean]> {
    // [etiqueta, valor, esInterno]. "Interno" = no sale nunca al sitio público.
    const comunes: Array<[string, string, boolean]> = [
      ['Estudiantes', f.estudiantes, true],
      ['Envía', f.acudiente_nombre, true],
      ['Recibida', fecha(f.creado_en), false],
    ];
    if (cola === 'negocios') {
      return [
        ...comunes,
        ['Contacto interno', `${f.acudiente_telefono ?? ''} · ${f.acudiente_correo ?? ''}`, true],
        ['Categoría', f.categoria, false],
        ['Teléfono', f.telefono, false],
        ['Dirección', f.direccion, false],
        ['Web', f.web ?? '—', false],
        ['Instagram', f.instagram ?? '—', false],
        ['Grado', f.grado ?? '(falta)', false],
      ];
    }
    if (cola === 'clasificados') {
      return [...comunes, ['Tipo', f.cat, false], ['Contacto público', `${f.telefono} · ${f.correo}`, false]];
    }
    return [
      ...comunes,
      ['Negocio', f.negocio, false],
      ['Teléfono', f.telefono, false],
      ['Vigencia', `${f.vigente_desde} → ${f.vigente_hasta}`, false],
      ['Condiciones', f.condiciones ?? '—', false],
    ];
  }

  function accionesDe(f: Fila): string {
    const id = escapar(f.id);
    if (f.estado === 'pendiente') {
      // El grado es obligatorio para aprobar un negocio, y la base lo impone con
      // un check: si falta, el update falla. Se pide aquí para no chocar con él.
      const grado =
        cola === 'negocios'
          ? `<input type="text" data-grado="${id}" value="${escapar(f.grado ?? '')}" placeholder="Grado" maxlength="10" aria-label="Grado de la familia">`
          : '';
      return `${grado}
        <button type="button" data-accion="aprobar" data-id="${id}">Aprobar y publicar</button>
        <button type="button" data-accion="rechazar" data-id="${id}">Rechazar</button>`;
    }
    if (f.estado === 'aprobado') {
      // Solo los negocios tienen página propia. Los clasificados y las
      // promociones se pintan como tarjetas dentro de la portada, así que el
      // enlace lleva a su sección; apuntar a /clasificados/<slug>/ daría 404.
      const destino =
        cola === 'negocios' ? (f.slug ? `/negocio/${escapar(f.slug)}/` : '') : `/#${cola}`;
      const ver = destino
        ? `<a class="li-btn" href="${destino}" target="_blank" rel="noopener">Ver publicado</a>`
        : '';
      return `${ver}<button type="button" data-accion="retirar" data-id="${id}">Retirar del sitio</button>`;
    }
    return `<button type="button" data-accion="republicar" data-id="${id}">Volver a publicar</button>`;
  }

  async function pintarLista() {
    const lista = $('[data-lista]');
    if (!lista) return;

    const filas = datos[cola].filter((f) => f.estado === estado);
    if (!filas.length) {
      lista.innerHTML = `<p class="vacio">No hay solicitudes en este estado.</p>`;
      return;
    }

    const fotos = await Promise.all(
      filas.map((f) => (cola === 'negocios' ? urlFoto(f.foto_ruta ?? null) : Promise.resolve(null))),
    );

    lista.innerHTML = filas
      .map((f, i) => {
        const titulo = f.nombre ?? f.titulo ?? f.descripcion?.slice(0, 60) ?? '(sin título)';
        const foto = fotos[i]
          ? `<img src="${escapar(fotos[i])}" alt="Foto enviada para ${escapar(titulo)}" loading="lazy">`
          : '';
        const campos = camposDe(f)
          .map(
            ([k, v, interno]) =>
              `<dt class="${interno ? 'interno' : ''}">${escapar(k)}</dt><dd>${escapar(v)}</dd>`,
          )
          .join('');
        return `<article class="ficha ${foto ? '' : 'sin-foto'}">
          ${foto ? `<div>${foto}</div>` : ''}
          <div>
            <span class="etiqueta">${escapar(f.estado)}</span>
            <h2>${escapar(titulo)}</h2>
            <p class="desc">${escapar(f.descripcion ?? '')}</p>
            <dl>${campos}</dl>
            <div class="acciones">${accionesDe(f)}</div>
          </div>
        </article>`;
      })
      .join('');
  }

  // --- acciones ------------------------------------------------------------

  async function actuar(accion: string, id: string, boton: HTMLButtonElement) {
    const cambios: Fila = { revisado_por: usuarioId, revisado_en: new Date().toISOString() };

    if (accion === 'aprobar') {
      cambios.estado = 'aprobado';
      if (cola === 'negocios') {
        const campo = $<HTMLInputElement>(`[data-grado="${id}"]`);
        const grado = campo?.value.trim() ?? '';
        if (!grado) {
          avisar('Escribe el grado antes de aprobar: es lo que sale en la ficha como «Familia — grado 7A».', 'error');
          campo?.focus();
          return;
        }
        cambios.grado = grado;
      }
    } else if (accion === 'rechazar') {
      cambios.estado = 'rechazado';
    } else if (accion === 'retirar') {
      cambios.estado = 'retirado';
    } else if (accion === 'republicar') {
      cambios.estado = 'aprobado';
      // Vaciar `publicado_en` es lo que hace que el cron la vuelva a tomar.
      cambios.publicado_en = null;
    }

    boton.disabled = true;
    const { error } = await db.from(TABLA[cola]).update(cambios).eq('id', id);
    boton.disabled = false;

    if (error) {
      // El check del grado vive en la base: si falta, el update falla aquí.
      const falta = error.message.includes('grado_obligatorio');
      avisar(
        falta
          ? 'La base rechazó la aprobación porque falta el grado.'
          : `No se pudo guardar: ${error.message}`,
        'error',
      );
      return;
    }

    avisar(
      accion === 'aprobar'
        ? 'Aprobada. Se publica en el sitio en el próximo ciclo, dentro de diez minutos como mucho.'
        : accion === 'retirar'
          ? 'Retirada. Desaparece del sitio en el próximo ciclo.'
          : accion === 'republicar'
            ? 'Vuelve a la cola de publicación.'
            : 'Rechazada. No se publica y queda en el histórico.',
    );
    await cargar();
    await pintarLista();
  }

  // --- eventos -------------------------------------------------------------

  for (const boton of raiz.querySelectorAll<HTMLButtonElement>('[data-cola]')) {
    boton.addEventListener('click', async () => {
      cola = boton.dataset.cola as Cola;
      for (const b of raiz.querySelectorAll('[data-cola]')) {
        b.setAttribute('aria-pressed', String(b === boton));
      }
      avisar('');
      await pintarLista();
    });
  }

  for (const boton of raiz.querySelectorAll<HTMLButtonElement>('[data-estado]')) {
    boton.addEventListener('click', async () => {
      estado = boton.dataset.estado as Estado;
      for (const b of raiz.querySelectorAll('[data-estado]')) {
        b.setAttribute('aria-pressed', String(b === boton));
      }
      avisar('');
      await pintarLista();
    });
  }

  // Delegado: las tarjetas se repintan enteras tras cada acción, así que atar
  // los eventos a cada botón obligaría a reatarlos cada vez.
  $('[data-lista]')?.addEventListener('click', (e) => {
    const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-accion][data-id]');
    if (boton) void actuar(boton.dataset.accion!, boton.dataset.id!, boton);
  });

  // --- arranque ------------------------------------------------------------

  const entrar = async () => {
    const sesion = await resolverSesion(db);
    if (!sesion) return vista('entrar');
    if (!sesion.esAdministrador) {
      const donde = $('[data-correo]');
      if (donde) donde.textContent = sesion.correo;
      return vista('sin-permiso');
    }
    const { data } = await db.auth.getSession();
    usuarioId = data.session?.user.id ?? '';
    const quien = $('[data-nombre]');
    if (quien) quien.textContent = sesion.nombre;
    vista('panel');
    try {
      await cargar();
      await pintarLista();
    } catch (e) {
      avisar(`No pudimos leer las solicitudes: ${(e as Error).message}`, 'error');
    }
  };

  raiz.querySelector('[data-accion="entrar"]')?.addEventListener('click', async () => {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/admin/` },
    });
    if (error) {
      const p = $('[data-error]');
      if (p) {
        p.textContent = 'No pudimos abrir la ventana de Google. Inténtalo de nuevo.';
        p.hidden = false;
      }
    }
  });

  for (const boton of raiz.querySelectorAll('[data-accion="salir"]')) {
    boton.addEventListener('click', async () => {
      await db.auth.signOut();
      location.replace('/admin/');
    });
  }

  db.auth.onAuthStateChange(() => void entrar());
  void entrar();
}
