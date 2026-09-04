import { crearCliente, resolverSesion } from '../lib/supabase';
import { CATEGORIAS } from '../data/categorias';
import { CATEGORIAS_CLASIFICADOS } from '../data/clasificados';
import { comprimirFoto, pesoLegible } from '../lib/foto';

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

interface Campo {
  nombre: string;
  etiqueta: string;
  tipo: 'texto' | 'area' | 'lista' | 'fecha' | 'archivo';
  requerido?: boolean;
  /** No sale nunca al sitio público. Se marca en el formulario. */
  interno?: boolean;
  ancho?: boolean;
  opciones?: readonly string[];
  max?: number;
}

/**
 * Qué campos tiene cada cola. La misma lista sirve para crear y para editar, y
 * se corresponde con las columnas de `supabase/01-esquema.sql`: los límites de
 * aquí son los mismos `check` que impone la base, repetidos como comodidad para
 * quien escribe, no como defensa.
 */
const COMUNES: Campo[] = [
  { nombre: 'estudiantes', etiqueta: 'Estudiantes y grado', tipo: 'texto', requerido: true, interno: true, max: 150, ancho: true },
  { nombre: 'acudiente_nombre', etiqueta: 'Quién lo envía', tipo: 'texto', requerido: true, interno: true, max: 80 },
];

const CAMPOS: Record<Cola, Campo[]> = {
  negocios: [
    ...COMUNES,
    { nombre: 'acudiente_telefono', etiqueta: 'Teléfono de contacto', tipo: 'texto', requerido: true, interno: true },
    { nombre: 'acudiente_correo', etiqueta: 'Correo de contacto', tipo: 'texto', requerido: true, interno: true },
    { nombre: 'nombre', etiqueta: 'Nombre del negocio', tipo: 'texto', requerido: true, max: 60 },
    { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'lista', requerido: true, opciones: CATEGORIAS },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', requerido: true, max: 200, ancho: true },
    { nombre: 'grado', etiqueta: 'Grado (sale en la ficha)', tipo: 'texto', max: 10 },
    { nombre: 'telefono', etiqueta: 'Teléfono del negocio', tipo: 'texto', requerido: true },
    { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'texto', requerido: true, max: 120 },
    { nombre: 'web', etiqueta: 'Web', tipo: 'texto', max: 80 },
    { nombre: 'instagram', etiqueta: 'Instagram (con @)', tipo: 'texto', max: 40 },
    { nombre: 'facebook', etiqueta: 'Facebook', tipo: 'texto', max: 80 },
    { nombre: 'foto', etiqueta: 'Foto', tipo: 'archivo', ancho: true },
  ],
  clasificados: [
    ...COMUNES,
    { nombre: 'cat', etiqueta: 'Tipo', tipo: 'lista', requerido: true, opciones: CATEGORIAS_CLASIFICADOS },
    { nombre: 'descripcion', etiqueta: 'Anuncio', tipo: 'area', requerido: true, max: 280, ancho: true },
    { nombre: 'telefono', etiqueta: 'Teléfono (se publica)', tipo: 'texto', requerido: true },
    { nombre: 'correo', etiqueta: 'Correo (se publica)', tipo: 'texto', requerido: true },
  ],
  promociones: [
    ...COMUNES,
    { nombre: 'acudiente_correo', etiqueta: 'Correo de contacto', tipo: 'texto', requerido: true, interno: true },
    { nombre: 'negocio', etiqueta: 'Negocio', tipo: 'texto', requerido: true, max: 60 },
    { nombre: 'titulo', etiqueta: 'Título', tipo: 'texto', requerido: true, max: 80 },
    { nombre: 'descripcion', etiqueta: 'En qué consiste', tipo: 'area', requerido: true, max: 280, ancho: true },
    { nombre: 'condiciones', etiqueta: 'Condiciones', tipo: 'area', max: 200, ancho: true },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', requerido: true },
    { nombre: 'vigente_desde', etiqueta: 'Válida desde', tipo: 'fecha', requerido: true },
    { nombre: 'vigente_hasta', etiqueta: 'Válida hasta', tipo: 'fecha', requerido: true },
  ],
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

  /** Editar y borrar están en todas, sea cual sea el estado. */
  function accionesComunes(f: Fila): string {
    const id = escapar(f.id);
    return `<button type="button" data-accion="editar" data-id="${id}">Editar</button>
      <button type="button" data-accion="borrar" data-id="${id}">Borrar</button>`;
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
            <div class="acciones">${accionesDe(f)}${accionesComunes(f)}</div>
          </div>
        </article>`;
      })
      .join('');
  }

  // --- crear y editar ------------------------------------------------------

  /** Qué fila se está editando. Vacío = se está creando una nueva. */
  let editando: Fila | null = null;

  function pintarFormulario(f: Fila | null) {
    const form = $<HTMLFormElement>('[data-formulario]');
    if (!form) return;
    editando = f;

    const valor = (c: Campo) => escapar(f?.[c.nombre] ?? '');
    const campos = CAMPOS[cola]
      .map((c) => {
        const marca = c.interno ? ' <span class="interno">no se publica</span>' : '';
        const req = c.requerido ? ' required' : '';
        const max = c.max ? ` maxlength="${c.max}"` : '';
        let control: string;
        if (c.tipo === 'area') {
          control = `<textarea name="${c.nombre}"${req}${max}>${valor(c)}</textarea>`;
        } else if (c.tipo === 'lista') {
          const ops = (c.opciones ?? [])
            .map((o) => `<option value="${escapar(o)}"${f?.[c.nombre] === o ? ' selected' : ''}>${escapar(o)}</option>`)
            .join('');
          control = `<select name="${c.nombre}"${req}><option value="">Elige…</option>${ops}</select>`;
        } else if (c.tipo === 'archivo') {
          // Al editar, la foto existente se conserva si no se elige otra.
          control = `<input type="file" name="${c.nombre}" accept="image/jpeg,image/png,image/webp">`;
        } else {
          const tipo = c.tipo === 'fecha' ? 'date' : 'text';
          control = `<input type="${tipo}" name="${c.nombre}" value="${valor(c)}"${req}${max}>`;
        }
        return `<div class="campo${c.ancho ? ' ancho' : ''}">
          <label for="${c.nombre}">${escapar(c.etiqueta)}${marca}</label>${control}
        </div>`;
      })
      .join('');

    form.innerHTML = `<h2>${f ? 'Editar' : 'Crear'} en ${escapar(cola)}</h2>${campos}
      <div class="pie">
        <button type="submit" class="li-btn">${f ? 'Guardar cambios' : 'Crear'}</button>
        <button type="button" data-accion="cancelar">Cancelar</button>
      </div>`;
    form.hidden = false;
    form.scrollIntoView({ block: 'nearest' });
  }

  async function guardar(form: HTMLFormElement) {
    const datosForm = new FormData(form);
    const fila: Fila = {};

    for (const c of CAMPOS[cola]) {
      if (c.tipo === 'archivo') continue;
      const v = String(datosForm.get(c.nombre) ?? '').trim();
      // Los opcionales vacíos van como null y no como cadena vacía: el esquema
      // distingue "sin dato" de "cadena vacía", y varios `check` rechazan la
      // segunda.
      fila[c.nombre] = v === '' ? null : v;
    }
    fila.revisado_por = usuarioId;
    fila.revisado_en = new Date().toISOString();

    // La foto se sube ANTES de escribir la fila, por lo mismo que en la Edge
    // Function: si falla la subida, mejor no dejar una ficha apuntando a un
    // archivo que no existe.
    const foto = datosForm.get('foto');
    if (foto instanceof File && foto.size > 0) {
      // Se comprime igual que en el formulario público, y por la misma razón de
      // fondo: la foto acaba commiteada en el repositorio y el historial de git
      // no olvida. Por aquí entró un JPG de 352 KB sin tocar; una foto de
      // celular de 5 MB se quedaría para siempre aunque se borre la ficha.
      let subir: Blob = foto;
      try {
        subir = await comprimirFoto(foto);
      } catch (e) {
        avisar((e as Error).message, 'error');
        return;
      }
      const ext = subir.type === 'image/webp' ? 'webp' : (foto.name.split('.').pop() ?? 'jpg').toLowerCase();
      const ruta = `panel/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from('fotos').upload(ruta, subir, { contentType: subir.type });
      if (error) {
        avisar(`No se pudo subir la foto: ${error.message}`, 'error');
        return;
      }
      if (subir.size < foto.size) {
        avisar(`Foto optimizada: ${pesoLegible(foto.size)} → ${pesoLegible(subir.size)}.`);
      }
      fila.foto_ruta = ruta;
    }

    const { error } = editando
      ? await db.from(TABLA[cola]).update(fila).eq('id', editando.id)
      : await db.from(TABLA[cola]).insert(fila);

    if (error) {
      avisar(`No se pudo guardar: ${error.message}`, 'error');
      return;
    }

    form.hidden = true;
    editando = null;
    avisar(
      'Guardado. Si está aprobada, el cambio se publica en el próximo ciclo: editar una ficha publicada la vuelve a publicar.',
    );
    await cargar();
    await pintarLista();
  }

  async function borrar(id: string, boton: HTMLButtonElement) {
    const fila = datos[cola].find((f) => f.id === id);
    const titulo = fila?.nombre ?? fila?.titulo ?? fila?.descripcion?.slice(0, 40) ?? 'esta entrada';
    if (!confirm(`¿Borrar «${titulo}» definitivamente? No se puede deshacer.`)) return;

    boton.disabled = true;
    const { error } = await db.from(TABLA[cola]).delete().eq('id', id);
    boton.disabled = false;

    if (error) {
      // La base impide borrar lo que sigue vivo en el sitio: si la fila
      // desapareciera, el cron nunca sabría que hay que quitar el archivo.
      avisar(error.message, 'error');
      return;
    }
    avisar('Borrada.');
    await cargar();
    await pintarLista();
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
      // El formulario abierto es de OTRA tabla: dejarlo visible invitaría a
      // guardar campos que no existen en la cola nueva.
      const form = $<HTMLFormElement>('[data-formulario]');
      if (form) form.hidden = true;
      editando = null;
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
    if (!boton) return;
    const accion = boton.dataset.accion!;
    const id = boton.dataset.id!;
    if (accion === 'editar') {
      pintarFormulario(datos[cola].find((f) => f.id === id) ?? null);
    } else if (accion === 'borrar') {
      void borrar(id, boton);
    } else {
      void actuar(accion, id, boton);
    }
  });

  $('[data-accion="nueva"]')?.addEventListener('click', () => {
    avisar('');
    pintarFormulario(null);
  });

  $<HTMLFormElement>('[data-formulario]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void guardar(e.currentTarget as HTMLFormElement);
  });

  $('[data-formulario]')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).dataset.accion === 'cancelar') {
      const form = $<HTMLFormElement>('[data-formulario]');
      if (form) form.hidden = true;
      editando = null;
    }
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
