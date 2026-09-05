/**
 * Publica al repositorio todo lo que esté pendiente, en UN SOLO COMMIT.
 *
 * Sustituye a los cuatro workflows de n8n que publicaban y retiraban. El motivo
 * de traerlo aquí no es ideológico: armar un commit con la API de Git de GitHub
 * son cinco llamadas encadenadas —ref, commit, blobs, árbol, mover rama— más un
 * bucle sobre N archivos. En nodos eso es frágil y no se lee; aquí son treinta
 * líneas.
 *
 * POR QUÉ UN SOLO COMMIT Y NO UNO POR FICHA
 *
 * El circuito anterior hacía un commit por ficha con la API de Contents. Cien
 * aprobaciones eran cien commits y **cien reconstrucciones encoladas** en
 * EasyPanel: con 700 familias, eso deja el despliegue inservible durante horas.
 * Con la API de Git Data, cien aprobaciones son un commit y una reconstrucción.
 *
 * Se llama de dos maneras:
 *   - `pg_cron`, cada diez minutos.
 *   - El botón «Publicar ahora» del panel, que evita la espera.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const REPO = Deno.env.get('GITHUB_REPO') ?? 'Frankdevia/catalogo_familias';
const RAMA = Deno.env.get('GITHUB_RAMA') ?? 'main';
const TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const API = `https://api.github.com/repos/${REPO}`;

interface Alta {
  cola: string;
  id: string;
  slug: string;
  ruta: string;
  contenido: Record<string, unknown>;
  foto_ruta: string | null;
  ruta_foto: string | null;
}
interface Baja {
  cola: string;
  id: string;
  slug: string;
  ruta: string;
  ruta_foto: string | null;
}

/**
 * Orden en que se escriben las claves de cada ficha.
 *
 * Postgres devuelve `jsonb` con las claves reordenadas —por longitud y luego
 * alfabéticamente—, así que sin esto el archivo sale como `web, foto, orden,
 * nombre…`. Da igual para Astro, que lee JSON, pero no para quien revisa: en
 * este repositorio los diffs son donde se comprueba que no se filtró nada, y un
 * orden aleatorio convierte cada cambio de un campo en un diff de once líneas.
 */
const ORDEN: Record<string, string[]> = {
  negocios: [
    'nombre', 'categoria', 'descripcion', 'familia', 'foto',
    'telefono', 'direccion', 'web', 'instagram', 'facebook', 'orden',
  ],
  clasificados: ['cat', 'desc', 'phone', 'email', 'publicado'],
  promociones: [
    'negocio', 'titulo', 'desc', 'condiciones', 'telefono', 'desde', 'hasta',
  ],
};

/** El contenido exacto del archivo: claves en orden, dos espacios, salto final. */
function serializar(cola: string, contenido: Record<string, unknown>): string {
  const orden = ORDEN[cola] ?? [];
  const ordenado: Record<string, unknown> = {};
  for (const clave of orden) {
    if (contenido[clave] !== undefined) ordenado[clave] = contenido[clave];
  }
  // Si algún día se añade un campo al esquema y se olvida aquí, va al final en
  // vez de desaparecer del archivo.
  for (const [clave, valor] of Object.entries(contenido)) {
    if (!(clave in ordenado)) ordenado[clave] = valor;
  }
  return JSON.stringify(ordenado, null, 2) + '\n';
}


/**
 * Borra las fotos de Storage que ya no referencia ninguna fila.
 *
 * Una foto sube ANTES de que exista su fila, y la fila puede acabar rechazada o
 * borrada. Cuando eso pasa el archivo se queda para siempre: nadie lo
 * referencia y nadie lo borra. Con 700 familias y un gigabyte de cuota, eso se
 * llena solo.
 *
 * Se respeta una hora de margen para no pisar una subida en vuelo: entre que la
 * foto entra y la fila se escribe pasan milisegundos, pero un envío que falle a
 * medias podría dejarla suelta unos segundos.
 */
async function limpiarHuerfanas(db: ReturnType<typeof createClient>): Promise<number> {
  let borradas = 0;
  try {
    // «Viva» es la foto que todavía hace falta en Storage. Una fila con
    // `foto_borrada_en` ya tiene su foto commiteada en el repositorio —el repo
    // es donde vive— así que su copia en Storage sobra, aunque la fila siga
    // apuntando a ella. Sin esta distinción quedaban ahí para siempre: no eran
    // huérfanas, y el borrado de después de publicar fallaba en silencio.
    const vivas = new Set<string>();
    const { data } = await db
      .from('solicitudes_negocios')
      .select('foto_ruta, foto_borrada_en')
      .not('foto_ruta', 'is', null);
    for (const f of data ?? []) {
      if (f.foto_ruta && !f.foto_borrada_en) vivas.add(f.foto_ruta as string);
    }

    const limite = Date.now() - 60 * 60 * 1000;
    for (const carpeta of ['pendientes', 'panel']) {
      const { data: archivos } = await db.storage.from('fotos').list(carpeta, { limit: 1000 });
      const sobran = (archivos ?? [])
        .filter((a) => {
          const creado = new Date(a.created_at ?? 0).getTime();
          return !vivas.has(`${carpeta}/${a.name}`) && creado < limite;
        })
        .map((a) => `${carpeta}/${a.name}`);
      if (sobran.length) {
        const { error } = await db.storage.from('fotos').remove(sobran);
        if (error) console.error('no se pudieron borrar fotos sobrantes', carpeta, error.message);
        else borradas += sobran.length;
      }
    }
  } catch (e) {
    // Limpiar es mantenimiento, no la tarea: si falla, la publicación sigue.
    console.error('no se pudieron limpiar fotos huérfanas', String(e));
  }
  return borradas;
}


/**
 * Comprueba una ficha ANTES de commitearla.
 *
 * Existe por lo que pasó el 4 de septiembre: una ficha apuntó a una foto
 * inexistente y el build del sitio ENTERO se cayó. No falló esa ficha: dejó de
 * desplegarse todo, incluidas las diez que estaban bien, y no se supo hasta que
 * alguien miró el rojo en EasyPanel cuatro despliegues después.
 *
 * Aquí se repite lo que `src/content.config.ts` exige, porque el que valida de
 * verdad es Astro y lo hace demasiado tarde: en el build, en otro sistema,
 * minutos después y sin avisar a nadie. Es una copia, sí; el precio de que
 * Postgres y Zod no compartan esquema. Si se añade un campo obligatorio al
 * catálogo, hay que tocar los dos sitios.
 */
function problemasDe(cola: string, c: Record<string, unknown>): string[] {
  const malos: string[] = [];
  const txt = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const exigir = (k: string) => {
    if (!txt(k).trim()) malos.push(`falta ${k}`);
  };

  if (cola === 'negocios') {
    // `direccion` NO está: no todos los negocios tienen local, y el esquema del
    // sitio la declara opcional. La consulta de publicación pasa por
    // `jsonb_strip_nulls`, así que cuando falta, la clave sencillamente no
    // llega y la ficha no dibuja la fila.
    // Ni `direccion` ni `foto`: las dos son opcionales en el esquema del sitio.
    // Sin local no hay fila «Dirección»; sin foto, la tarjeta y la ficha
    // dibujan la inicial. La consulta pasa por `jsonb_strip_nulls`, así que lo
    // que falta sencillamente no llega.
    for (const k of ['nombre', 'categoria', 'descripcion', 'familia', 'telefono']) exigir(k);
    // El grado llega dentro de `familia`; si faltaba, queda "Familia — grado ".
    if (txt('familia').trim().endsWith('grado')) malos.push('la ficha no tiene grado');
    if (!/^[0-9 ]+$/.test(txt('telefono'))) malos.push(`teléfono inválido: ${txt('telefono')}`);
    if (txt('instagram') && !txt('instagram').startsWith('@')) malos.push('instagram sin arroba');
  } else if (cola === 'clasificados') {
    for (const k of ['cat', 'desc', 'phone', 'email', 'publicado']) exigir(k);
    if (!/^[0-9 ]+$/.test(txt('phone'))) malos.push(`teléfono inválido: ${txt('phone')}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt('email'))) malos.push('correo inválido');
  } else {
    for (const k of ['negocio', 'titulo', 'desc', 'telefono', 'desde', 'hasta']) exigir(k);
    if (!/^[0-9 ]+$/.test(txt('telefono'))) malos.push(`teléfono inválido: ${txt('telefono')}`);
    if (txt('hasta') < txt('desde')) malos.push('la vigencia termina antes de empezar');
  }
  for (const k of ['desde', 'hasta', 'publicado']) {
    if (txt(k) && !/^\d{4}-\d{2}-\d{2}$/.test(txt(k))) malos.push(`fecha inválida en ${k}`);
  }
  return malos;
}

async function github(camino: string, opciones: RequestInit = {}) {
  const r = await fetch(`${API}${camino}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
  });
  if (!r.ok) {
    throw new Error(`GitHub ${opciones.method ?? 'GET'} ${camino} → ${r.status}: ${await r.text()}`);
  }
  return r.json();
}

Deno.serve(async (peticion) => {
  const cors = {
    'Access-Control-Allow-Origin': Deno.env.get('SITIO_ORIGEN') ?? 'https://comunidad.liceoingles.edu.co',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const responder = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (!TOKEN) return responder({ ok: false, error: 'Falta el secreto GITHUB_TOKEN.' }, 500);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    // Las promociones vencidas pasan a `retirado` antes de mirar qué hay
    // pendiente, para que su baja entre en esta misma pasada y no en la siguiente.
    const { data: caducadas } = await db.rpc('caducar_promociones');

    const { data: pendientes, error } = await db.rpc('pendientes_de_publicar');
    if (error) throw error;

    const altas: Alta[] = pendientes?.altas ?? [];
    const bajas: Baja[] = pendientes?.bajas ?? [];

    // La limpieza es mantenimiento, no la tarea, y con el cron cada minuto
    // correría 1.440 veces al día listando Storage para no borrar nada. Se hace
    // una vez por hora —cuando el minuto es 7, para no coincidir con el pico de
    // en punto— o siempre que haya algo que publicar, que es cuando de verdad
    // se generan huérfanas.
    const hayTrabajo = Boolean(pendientes?.altas?.length || pendientes?.bajas?.length);
    const tocaLimpiar = hayTrabajo || new Date().getMinutes() === 7;
    const huerfanas = tocaLimpiar ? await limpiarHuerfanas(db) : 0;

    if (!altas.length && !bajas.length) {
      return responder({ ok: true, sin_cambios: true, caducadas, huerfanas_borradas: huerfanas });
    }

    // --- de dónde partimos ---------------------------------------------------
    const ref = await github(`/git/ref/heads/${RAMA}`);
    const commitBase = await github(`/git/commits/${ref.object.sha}`);

    // --- las entradas del árbol ---------------------------------------------
    // `content` en línea sirve para los JSON, que son texto. Las fotos son
    // binarias y necesitan un blob en base64 creado aparte.
    const arbol: Array<Record<string, unknown>> = [];

    // El árbol actual del repositorio, para poder comprobar que las fotos a las
    // que apuntan las fichas EXISTEN. Es la comprobación que faltaba el día que
    // una ficha apuntó a un archivo inexistente y tumbó el build entero:
    // Postgres no puede saber qué hay en el repositorio, pero GitHub sí.
    const arbolActual = await github(`/git/trees/${commitBase.tree.sha}?recursive=1`);
    const enElRepo = new Set<string>((arbolActual.tree ?? []).map((n: { path: string }) => n.path));

    // Se aparta lo que no compilaría en vez de tumbar la publicación entera:
    // una ficha mala no debe impedir que salgan las nueve buenas. Las apartadas
    // se quedan pendientes y salen en la respuesta con el motivo.
    const rechazadas: Array<{ slug: string; motivos: string[] }> = [];

    // De quién es cada slug de negocio que ya existe. Solo esta cola lo necesita:
    // los slugs de clasificados y promociones llevan dentro un trozo del id, así
    // que no pueden chocar. Los de negocios salen del nombre, y dos familias
    // pueden registrar el mismo negocio.
    const duenoDelSlug = new Map<string, string>();
    {
      const slugs = altas.filter((a) => a.cola === 'negocios').map((a) => a.slug);
      if (slugs.length) {
        const { data } = await db
          .from('solicitudes_negocios')
          .select('id, slug')
          .in('slug', slugs);
        for (const f of data ?? []) if (f.slug) duenoDelSlug.set(f.slug as string, f.id as string);
      }
    }

    // Dos fichas con el mismo nombre dan el mismo slug, y el slug es único en la
    // base. Si las dos pasan, la segunda revienta `sellar_publicados` con una
    // violación de unicidad y —como el sello va DESPUÉS del commit— el
    // resultado es un commit que sale y un sello que no: en la pasada siguiente
    // vuelve a estar todo pendiente. Eso encadenó decenas de commits idénticos
    // y otras tantas reconstrucciones antes de que nadie lo notara, porque la
    // respuesta seguía diciendo «ok».
    const rutasVistas = new Set<string>();

    const buenas = altas.filter((a) => {
      const motivos = problemasDe(a.cola, a.contenido);

      if (rutasVistas.has(a.ruta)) {
        motivos.push(`otra ficha aprobada escribe el mismo archivo (${a.ruta}): hay dos con el mismo nombre`);
      } else {
        rutasVistas.add(a.ruta);
      }

      // Y el choque también puede ser contra algo que YA está publicado: esa
      // ficha no está en esta cola, pero su slug sí está ocupado, y sellar
      // reventaría igual.
      const dueno = duenoDelSlug.get(a.slug);
      if (dueno && dueno !== a.id) {
        motivos.push(`el nombre «${a.slug}» ya lo usa otra ficha: son dos registros del mismo negocio`);
      }

      // La foto tiene que existir: o se sube en este mismo commit, o ya está en
      // el repositorio. Si no, Astro no compila y se cae el sitio COMPLETO, no
      // solo esta ficha.
      const foto = typeof a.contenido.foto === 'string' ? a.contenido.foto : '';
      if (foto) {
        const ruta = 'src/assets/photos/' + foto.split('/').pop();
        const seSubeAhora = Boolean(a.foto_ruta && a.ruta_foto);
        if (!seSubeAhora && !enElRepo.has(ruta)) {
          motivos.push(`la foto ${ruta} no existe en el repositorio`);
        }
      }

      if (motivos.length) rechazadas.push({ slug: a.slug, motivos });
      return motivos.length === 0;
    });

    // Si TODO lo pendiente resulta inválido no hay nada que commitear: sin esto
    // se crearía un commit vacío y una reconstrucción inútil en cada pasada,
    // para siempre, mientras el dato malo siga ahí.
    if (!buenas.length && !bajas.length) {
      console.error('nada publicable', JSON.stringify(rechazadas));
      return responder({ ok: true, sin_cambios: true, caducadas, huerfanas_borradas: huerfanas, rechazadas });
    }

    // Lo que de verdad entra en el commit. No es `buenas`: una ficha puede
    // caerse aquí, al ir a por su foto.
    const publicadas: typeof buenas = [];

    for (const a of buenas) {
      // Las entradas de esta ficha se preparan aparte y solo se añaden al árbol
      // si TODA la ficha sale bien. Si no, el commit llevaría el JSON sin su
      // foto y el build se caería por la imagen que falta.
      const entradas: Array<Record<string, unknown>> = [
        { path: a.ruta, mode: '100644', type: 'blob', content: serializar(a.cola, a.contenido) },
      ];

      if (a.foto_ruta && a.ruta_foto) {
        const { data: archivo, error: errorFoto } = await db.storage.from('fotos').download(a.foto_ruta);
        if (errorFoto || !archivo) {
          // Storage ya no tiene esa foto. Antes esto lanzaba, y una sola ficha
          // así dejaba el sitio entero sin publicar: ni las fichas buenas ni
          // las retiradas salían, en cada pasada del cron, para siempre. Se
          // aparta como cualquier otro dato malo y las demás siguen.
          rechazadas.push({
            slug: a.slug,
            motivos: [`su foto ya no está en Storage (${a.foto_ruta}): ${errorFoto?.message ?? 'no se pudo bajar'}`],
          });
          continue;
        }
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        let binario = '';
        for (const b of bytes) binario += String.fromCharCode(b);
        const blob = await github('/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content: btoa(binario), encoding: 'base64' }),
        });
        entradas.push({ path: a.ruta_foto, mode: '100644', type: 'blob', sha: blob.sha });
      }

      arbol.push(...entradas);
      publicadas.push(a);
    }

    // Se vuelve a mirar: puede que las únicas altas fueran las que acaban de
    // caerse, y entonces no hay commit que hacer.
    if (!publicadas.length && !bajas.length) {
      console.error('nada publicable', JSON.stringify(rechazadas));
      return responder({ ok: true, sin_cambios: true, caducadas, huerfanas_borradas: huerfanas, rechazadas });
    }

    // Una entrada con `sha: null` es como se borra un archivo en un árbol.
    for (const b of bajas) {
      arbol.push({ path: b.ruta, mode: '100644', type: 'blob', sha: null });
      if (b.ruta_foto) arbol.push({ path: b.ruta_foto, mode: '100644', type: 'blob', sha: null });
    }

    // --- el commit -----------------------------------------------------------
    const nuevoArbol = await github('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: arbol }),
    });

    const resumen = [
      publicadas.length ? `publica ${publicadas.length}` : '',
      bajas.length ? `retira ${bajas.length}` : '',
    ].filter(Boolean).join(' y ');

    const commit = await github('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `Actualiza el catálogo: ${resumen}\n\nGenerado por la función «publicar» a partir de lo aprobado en el panel.`,
        tree: nuevoArbol.sha,
        parents: [ref.object.sha],
      }),
    });

    await github(`/git/refs/heads/${RAMA}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    // --- sellar --------------------------------------------------------------
    // Solo después de que el commit haya salido. Si algo falla antes, no se
    // sella nada y la siguiente pasada lo reintenta: publicar dos veces es
    // inocuo —el contenido es el mismo— y dar por publicado lo que no llegó, no.
    const ids = (lista: Array<{ cola: string; id: string }>, cola: string) =>
      lista.filter((x) => x.cola === cola).map((x) => x.id);

    // El error del sello NO se puede tragar. supabase-js devuelve `{ error }` en
    // vez de lanzar, así que sin mirarlo la respuesta decía «ok» mientras nada
    // quedaba marcado como publicado y el cron repetía el mismo commit cada
    // minuto. Es el fallo más caro posible: silencioso y en bucle.
    const fallos: string[] = [];
    const { error: errorSello } = await db.rpc('sellar_publicados', {
      ids_negocios: ids(publicadas, 'negocios'),
      ids_clasificados: ids(publicadas, 'clasificados'),
      ids_promociones: ids(publicadas, 'promociones'),
    });
    if (errorSello) {
      console.error('el sello de publicados falló', errorSello.message);
      fallos.push(`no se pudo sellar lo publicado: ${errorSello.message}`);
    }

    const { error: errorRetiro } = await db.rpc('sellar_retirados', {
      ids_negocios: ids(bajas, 'negocios'),
      ids_clasificados: ids(bajas, 'clasificados'),
      ids_promociones: ids(bajas, 'promociones'),
    });
    if (errorRetiro) {
      console.error('el sello de retirados falló', errorRetiro.message);
      fallos.push(`no se pudo sellar lo retirado: ${errorRetiro.message}`);
    }

    // Las fotos ya viven en el repositorio: fuera de Storage. Sin esto, 700
    // fotos de hasta 1,5 MB llenan el gigabyte del plan gratuito.
    // Solo si el sello salió bien: si no, la fila sigue creyendo que su foto
    // está en Storage y borrarla la dejaría sin nada que subir en el reintento.
    const paraBorrar = errorSello
      ? []
      : publicadas.map((a) => a.foto_ruta).filter((r): r is string => Boolean(r));
    if (paraBorrar.length) {
      // Igual que el sello: `remove` devuelve `{ error }` en vez de lanzar, y
      // sin mirarlo cinco fotos ya commiteadas se quedaron ocupando Storage sin
      // que nada lo dijera. Son 1,5 MB por familia y el plan gratuito tiene un
      // gigabyte. No tumba la publicación —el commit ya salió y es correcto—
      // pero tiene que verse.
      const { error } = await db.storage.from('fotos').remove(paraBorrar);
      if (error) {
        console.error('no se pudieron liberar las fotos de Storage', error.message);
        fallos.push(`las fotos siguen en Storage: ${error.message}`);
      }
    }

    // --- el despliegue ---------------------------------------------------------
    //
    // NO se llama a EasyPanel. Lo dispara el webhook de GitHub al recibir este
    // commit, y con eso basta.
    //
    // Antes se llamaba, para no depender de una notificación que se había
    // atascado dos veces. El remedio salió peor: EasyPanel recibía DOS avisos
    // del mismo commit con un segundo de diferencia —el nuestro y el de
    // GitHub— y mataba los dos. En el historial se ven por parejas, de uno y
    // nueve segundos, ambos con «gzip: unexpected end of file / Killed».
    //
    // La consecuencia era la que se quería evitar: el 5 de septiembre dos
    // anuncios recién publicados no llegaron al sitio, con la base y el
    // repositorio al día. Un disparo único los desplegó en 27 segundos.
    //
    // Si alguna vez el webhook vuelve a atascarse, el commit siguiente arrastra
    // lo pendiente, y siempre queda el botón «Implementar» de EasyPanel.
    const despliegue = 'lo lanza el webhook de GitHub con este commit';

    return responder({
      ok: true,
      commit: commit.sha,
      publicadas: publicadas.length,
      rechazadas,
      ...(fallos.length ? { fallos } : {}),
      retiradas: bajas.length,
      caducadas,
      fotos_liberadas: paraBorrar.length,
      huerfanas_borradas: huerfanas,
      despliegue,
    });
  } catch (e) {
    console.error('publicar falló', String(e));
    return responder({ ok: false, error: String(e) }, 500);
  }
});
