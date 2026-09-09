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
  tipo: 'texto' | 'area' | 'lista' | 'fecha' | 'archivo' | 'casilla';
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
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', requerido: true, max: 1200, ancho: true },
    { nombre: 'grado', etiqueta: 'Grado (sale en la ficha)', tipo: 'texto', max: 10 },
    { nombre: 'telefono', etiqueta: 'Teléfono del negocio', tipo: 'texto', requerido: true },
    // Sin `requerido`: vaciarla es la manera de quitar la fila «Dirección» de
    // una ficha ya publicada. El formulario guarda el vacío como null.
    { nombre: 'direccion', etiqueta: 'Dirección (opcional)', tipo: 'texto', max: 120 },
    { nombre: 'web', etiqueta: 'Web', tipo: 'texto', max: 80 },
    { nombre: 'instagram', etiqueta: 'Instagram (con @)', tipo: 'texto', max: 40 },
    { nombre: 'facebook', etiqueta: 'Facebook', tipo: 'texto', max: 80 },
    { nombre: 'foto', etiqueta: 'Foto', tipo: 'archivo', ancho: true },
    // El sitio decide solo si una foto se recorta o se ve entera, mirando si
    // sus bordes son de un color liso. Acierta con los logos; con un volante
    // que lleva fotos dentro, no. Esto es el desempate manual.
    {
      nombre: 'foto_completa',
      etiqueta: 'Mostrar la foto completa, sin recortar',
      tipo: 'casilla',
      ancho: true,
    },
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

    void comprobarSitio();
  }

  /**
   * ¿Ha llegado al sitio lo último que se publicó?
   *
   * Antes esto contaba fichas: cuántas hay en la base frente a cuántas en el
   * sitemap. Servía para el caso de septiembre en que una compilación rota dejó
   * ocho fuera, y no servía para nada más. El 8 de septiembre se marcó «foto
   * completa» en una ficha, el sitio no reconstruyó, y el aviso calló: 52 y 52.
   * La ficha estaba en los dos lados; lo que había cambiado era su contenido.
   *
   * Ahora se comparan FECHAS. El sitio sella su hora de compilación en
   * `/version.json` y aquí se mira contra la publicación más reciente. Si se
   * publicó algo después de la última compilación, ese cambio no está en la
   * página, sea del tipo que sea.
   *
   * Es una comprobación de cortesía: si algo falla —red, archivo ausente— se
   * calla. Prefiero no avisar a dar una alarma falsa.
   */
  async function comprobarSitio() {
    const aviso = $('[data-desfase]');
    if (!aviso) return;

    // La publicación más reciente de las tres colas: cualquiera de ellas
    // debería estar ya en la página.
    const publicaciones = (Object.keys(TABLA) as Cola[])
      .flatMap((c) => datos[c])
      .filter((f) => f.publicado_en)
      .map((f) => new Date(f.publicado_en as string).getTime())
      .filter((t) => Number.isFinite(t));
    if (!publicaciones.length) return;
    const ultimaPublicacion = Math.max(...publicaciones);

    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const { construido } = (await r.json()) as { construido?: string };
      const compilado = new Date(construido ?? '').getTime();
      if (!Number.isFinite(compilado)) return;

      // Cinco minutos de margen: entre que se publica y que el contenedor
      // arranca pasa un rato, y avisar en esa ventana sería ruido.
      const MARGEN = 5 * 60 * 1000;
      const atrasado = ultimaPublicacion > compilado + MARGEN;

      aviso.hidden = !atrasado;
      if (atrasado) {
        const hora = (t: number) =>
          new Date(t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
        aviso.textContent =
          `Lo último se publicó el ${hora(ultimaPublicacion)} y el sitio se ` +
          `construyó por última vez el ${hora(compilado)}: ese cambio todavía no ` +
          `está en la página. La compilación falló — revisa el historial de ` +
          `despliegues en EasyPanel.`;
      }
    } catch {
      // Sin red o sin sello: no se puede saber, y no saber no es una alarma.
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
        } else if (c.tipo === 'casilla') {
          control = `<input type="checkbox" name="${c.nombre}" value="si"${f?.[c.nombre] ? ' checked' : ''}>`;
        } else if (c.tipo === 'archivo') {
          // Al editar, la foto existente se conserva si no se elige otra.
          control = `<input type="file" name="${c.nombre}" accept="image/jpeg,image/png,image/webp">`;
        } else {
          const tipo = c.tipo === 'fecha' ? 'date' : 'text';
          control = `<input type="${tipo}" name="${c.nombre}" value="${valor(c)}"${req}${max}>`;
        }
        // La casilla va con su texto AL LADO y dentro del propio <label>: una
        // etiqueta encima de un cuadradito se lee como un título huérfano, y
        // así además se puede pulsar el texto para marcarla.
        if (c.tipo === 'casilla') {
          return `<div class="campo ancho campo--casilla">
            <label>${control}<span>${escapar(c.etiqueta)}${marca}</span></label>
          </div>`;
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
      // Se colapsan los espacios internos, no solo los extremos: un doble
      // espacio en el nombre acaba en el slug de la ficha publicada.
      // Una casilla no marcada no aparece en el FormData: su ausencia ES el
      // «false», y tratarla como texto vacío la guardaría como null, que en una
      // columna `not null` revienta.
      if (c.tipo === 'casilla') {
        fila[c.nombre] = datosForm.get(c.nombre) === 'si';
        continue;
      }
      const v = String(datosForm.get(c.nombre) ?? '').replace(/\s+/g, ' ').trim();
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

      /*
       * Reemplazar una foto NO funcionaba, y hacía falta limpiar estos dos.
       *
       * `foto_borrada_en` lo pone la publicación cuando ya subió la foto al
       * repositorio y la borró de Storage. Mientras siga puesto,
       * `pendientes_de_publicar()` devuelve `foto_ruta` en null y la función no
       * sube nada: el commit sale vacío y la foto nueva se queda en Storage
       * para siempre. Le pasó a SCQ SAS el 9 de septiembre.
       *
       * `foto_archivo` es el nombre con el que la foto entró al repositorio, y
       * es lo que el JSON publica. La función escribe la nueva en
       * `<slug>.<extensión de la nueva>`, así que si el nombre viejo se queda,
       * la ficha acaba apuntando a un archivo que ya no es el suyo: un .jpg que
       * fue reemplazado por un .webp deja la ficha señalando al .jpg.
       *
       * Con los dos en null, la foto nueva se trata como lo que es: una foto
       * que todavía no ha llegado al repositorio.
       */
      fila.foto_borrada_en = null;
      fila.foto_archivo = null;
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

  /**
   * Borrar, incluso lo que está publicado.
   *
   * La base impide borrar una fila que sigue viva en el sitio, y con razón: el
   * archivo del repositorio se quita leyendo esa misma fila, así que si
   * desaparece antes, el negocio se queda publicado para siempre sin nada en el
   * panel con lo que retirarlo.
   *
   * Eso convertía «Borrar» en un botón que solo daba un error. La regla se
   * queda —es la que protege—, pero el trabajo lo hace el panel: retira, pide
   * la publicación en el momento, comprueba que el archivo ya salió del
   * repositorio y solo entonces borra. Son tres pasos y unos segundos, no un
   * mensaje pidiéndole a quien revisa que los dé a mano y vuelva luego.
   */
  async function borrar(id: string, boton: HTMLButtonElement) {
    const fila = datos[cola].find((f) => f.id === id);
    const titulo = fila?.nombre ?? fila?.titulo ?? fila?.descripcion?.slice(0, 40) ?? 'esta entrada';
    const publicada = Boolean(fila?.publicado_en) && !fila?.retirado_en;

    const aviso = publicada
      ? `«${titulo}» está publicada. Se quitará del sitio y después se borrará ` +
        `definitivamente. No se puede deshacer.`
      : `¿Borrar «${titulo}» definitivamente? No se puede deshacer.`;
    if (!confirm(aviso)) return;

    boton.disabled = true;
    try {
      if (publicada && !(await retirarDelSitio(id, titulo))) return;

      const { error } = await db.from(TABLA[cola]).delete().eq('id', id);
      if (error) {
        avisar(error.message, 'error');
        return;
      }
      avisar(publicada ? `«${titulo}» salió del sitio y quedó borrada.` : 'Borrada.');
      await cargar();
      await pintarLista();
    } finally {
      boton.disabled = false;
    }
  }

  /**
   * Deja una ficha publicada lista para borrarse, y dice si lo consiguió.
   *
   * `retirado_en` es la señal: lo escribe la publicación cuando ya ha quitado
   * el archivo del repositorio. Hasta que aparece, borrar sigue prohibido, así
   * que se relee la fila en vez de dar por hecho que la llamada bastó.
   */
  async function retirarDelSitio(id: string, titulo: string): Promise<boolean> {
    avisar(`Quitando «${titulo}» del sitio…`);

    const { error: errorRetiro } = await db
      .from(TABLA[cola])
      .update({ estado: 'retirado', revisado_por: usuarioId, revisado_en: new Date().toISOString() })
      .eq('id', id);
    if (errorRetiro) {
      avisar(`No se pudo retirar: ${errorRetiro.message}`, 'error');
      return false;
    }

    const { error: errorPublicar } = await db.functions.invoke('publicar', { method: 'POST' });
    if (errorPublicar) {
      // Se queda retirada, que es un estado bueno: el ciclo automático la
      // terminará de sacar y entonces se podrá borrar desde «Retirados».
      avisar(
        `«${titulo}» quedó retirada, pero la publicación falló (${errorPublicar.message}). ` +
          `Sale del sitio en el próximo ciclo y ya se podrá borrar.`,
        'error',
      );
      await cargar();
      await pintarLista();
      return false;
    }

    const { data } = await db.from(TABLA[cola]).select('retirado_en').eq('id', id).single();
    if (!data?.retirado_en) {
      avisar(
        `«${titulo}» quedó retirada, pero todavía no consta fuera del repositorio. ` +
          `Espera al próximo ciclo y bórrala desde «Retirados».`,
        'error',
      );
      await cargar();
      await pintarLista();
      return false;
    }
    return true;
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

  /**
   * Adelanta la publicación en vez de esperar al cron de diez minutos.
   *
   * Llama a la MISMA función que el cron, con la sesión de quien revisa. No
   * hace nada distinto ni salta ninguna comprobación: solo adelanta el reloj.
   * Si no hay nada pendiente, lo dice y no toca el repositorio.
   */
  $('[data-accion="publicar-ya"]')?.addEventListener('click', async (e) => {
    const boton = e.currentTarget as HTMLButtonElement;
    boton.disabled = true;
    avisar('Publicando…');
    const { data, error } = await db.functions.invoke('publicar', { method: 'POST' });
    boton.disabled = false;

    if (error) {
      avisar(`No se pudo publicar: ${error.message}`, 'error');
      return;
    }
    // Lo apartado se cuenta SIEMPRE, haya habido commit o no. Una ficha con un
    // dato que no compila se queda aprobada y sin publicar, y sin decirlo aquí
    // el panel la enseña como publicada mientras el sitio no la tiene: nadie
    // mira los registros de la función.
    const apartadas: string = (data?.rechazadas ?? [])
      .map((r: { slug: string; motivos: string[] }) => `«${r.slug}»: ${r.motivos.join('; ')}`)
      .join(' · ');

    if (data?.fallos?.length) {
      avisar(`La publicación salió pero algo quedó a medias: ${data.fallos.join(' · ')}`, 'error');
      return;
    }

    if (data?.sin_cambios) {
      avisar(
        apartadas
          ? `Nada nuevo que publicar. Hay ${data.rechazadas.length} sin publicar por un dato — ${apartadas}`
          : 'No había nada pendiente: el sitio ya está al día.',
        apartadas ? 'error' : 'info',
      );
      return;
    }
    const partes = [
      data?.publicadas ? `${data.publicadas} publicada(s)` : '',
      data?.retiradas ? `${data.retiradas} retirada(s)` : '',
      data?.caducadas ? `${data.caducadas} promoción(es) vencida(s)` : '',
    ].filter(Boolean).join(' · ');
    // El despliegue se avisa aparte porque puede fallar sin que la publicación
    // haya fallado: el commit ya salió y los datos ya son coherentes.
    const aviso =
      data?.despliegue === 'lanzado'
        ? 'El sitio se está reconstruyendo; tarda un par de minutos.'
        : `Ojo: el despliegue no arrancó (${data?.despliegue}). El commit sí salió.`;
    const problema = apartadas ? ` Quedan ${data.rechazadas.length} sin publicar — ${apartadas}` : '';
    avisar(
      `${partes}. ${aviso}${problema}`,
      data?.despliegue === 'lanzado' && !problema ? 'info' : 'error',
    );

    await cargar();
    await pintarLista();
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
