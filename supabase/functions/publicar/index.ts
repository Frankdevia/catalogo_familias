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

    if (!altas.length && !bajas.length) {
      return responder({ ok: true, sin_cambios: true, caducadas });
    }

    // --- de dónde partimos ---------------------------------------------------
    const ref = await github(`/git/ref/heads/${RAMA}`);
    const commitBase = await github(`/git/commits/${ref.object.sha}`);

    // --- las entradas del árbol ---------------------------------------------
    // `content` en línea sirve para los JSON, que son texto. Las fotos son
    // binarias y necesitan un blob en base64 creado aparte.
    const arbol: Array<Record<string, unknown>> = [];

    for (const a of altas) {
      arbol.push({
        path: a.ruta,
        mode: '100644',
        type: 'blob',
        content: serializar(a.cola, a.contenido),
      });

      if (a.foto_ruta && a.ruta_foto) {
        const { data: archivo, error: errorFoto } = await db.storage.from('fotos').download(a.foto_ruta);
        if (errorFoto || !archivo) throw new Error(`No se pudo bajar la foto ${a.foto_ruta}: ${errorFoto?.message}`);
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        let binario = '';
        for (const b of bytes) binario += String.fromCharCode(b);
        const blob = await github('/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content: btoa(binario), encoding: 'base64' }),
        });
        arbol.push({ path: a.ruta_foto, mode: '100644', type: 'blob', sha: blob.sha });
      }
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
      altas.length ? `publica ${altas.length}` : '',
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

    await db.rpc('sellar_publicados', {
      ids_negocios: ids(altas, 'negocios'),
      ids_clasificados: ids(altas, 'clasificados'),
    });
    await db.rpc('sellar_retirados', {
      ids_negocios: ids(bajas, 'negocios'),
      ids_clasificados: ids(bajas, 'clasificados'),
    });

    // Las fotos ya viven en el repositorio: fuera de Storage. Sin esto, 700
    // fotos de hasta 1,5 MB llenan el gigabyte del plan gratuito.
    const paraBorrar = altas.map((a) => a.foto_ruta).filter((r): r is string => Boolean(r));
    if (paraBorrar.length) await db.storage.from('fotos').remove(paraBorrar);

    return responder({
      ok: true,
      commit: commit.sha,
      publicadas: altas.length,
      retiradas: bajas.length,
      caducadas,
      fotos_liberadas: paraBorrar.length,
    });
  } catch (e) {
    console.error('publicar falló', String(e));
    return responder({ ok: false, error: String(e) }, 500);
  }
});
