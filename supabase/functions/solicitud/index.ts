/**
 * Recibe las solicitudes de los tres formularios: negocios, clasificados y
 * promociones.
 *
 * Es la ÚNICA puerta de escritura. El rol anónimo no tiene permisos sobre las
 * tablas (ver `supabase/02-rls.sql`), así que la anon key que viaja en el
 * JavaScript del sitio no sirve para insertar nada: hay que pasar por aquí, y
 * aquí se valida antes de tocar la base.
 *
 * Sustituye a los nodos "Validar solicitud" de los dos workflows de n8n. Las
 * reglas son las mismas y salen del mismo archivo que usa el navegador, no de
 * una copia: esa lista ya se nos desincronizó dos veces.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  LIMITES,
  CAMPO_TRAMPA,
  normalizarTelefono,
  normalizarWeb,
  normalizarInstagram,
} from '../_shared/reglas.ts';

// El sitio es el único origen que puede llamar. No es una defensa —un POST con
// curl no manda Origin— pero evita que otra página use este endpoint desde el
// navegador de un visitante.
const ORIGEN = Deno.env.get('SITIO_ORIGEN') ?? 'https://comunidad.liceoingles.edu.co';

const CORS = {
  'Access-Control-Allow-Origin': ORIGEN,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Cuántos envíos se aceptan de la misma huella en la ventana.
 *
 * Treinta y no cinco porque **un colegio entero sale por la misma IP**: si el
 * lanzamiento se anuncia en una reunión y veinte familias llenan el formulario
 * desde el wifi del Liceo, un límite bajo les niega el envío por algo que no
 * han hecho. Treinta sigue parando a un script.
 */
const LIMITE = { envios: 30, minutos: 10 };

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Rechazo con el campo señalado, que es lo que el formulario sabe pintar. */
const no = (campo: string | null, mensaje: string) =>
  responder({ ok: false, campo, mensaje }, 422);

// Recorta los extremos Y colapsa los espacios internos. Lo segundo importa
// más de lo que parece: "IT  Services" con doble espacio se coló hasta el slug
// y el título de la ficha publicada, y ahí ya no se arregla sin romper la URL.
const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Huella de la IP, no la IP. Sirve para contar, no para identificar a nadie, y
 * así no guardamos direcciones de familias en una tabla.
 */
async function huella(ip: string): Promise<string> {
  const sal = Deno.env.get('SAL_HUELLA') ?? 'fli-fbc';
  const datos = new TextEncoder().encode(`${sal}:${ip}`);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (peticion.method !== 'POST') return responder({ ok: false, mensaje: 'Método no permitido.' }, 405);

  // La clave de servicio se salta RLS. Es la razón de ser de esta función: la
  // validación de arriba es lo único que separa un POST de una fila insertada.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let cuerpo: Record<string, unknown>;
  try {
    const tipo = peticion.headers.get('content-type') ?? '';
    if (tipo.includes('application/json')) {
      cuerpo = await peticion.json();
    } else {
      // Los formularios mandan form-urlencoded o multipart, que es lo que evita
      // el preflight y lo que ya funcionaba con n8n.
      cuerpo = Object.fromEntries(await peticion.formData()) as Record<string, unknown>;
    }
  } catch {
    return responder({ ok: false, mensaje: 'No pudimos leer la solicitud.' }, 400);
  }

  // --- campo trampa --------------------------------------------------------
  // Un bot rellena todos los inputs que encuentra; una persona no ve este
  // porque está oculto. Se responde 200 a propósito: si se devolviera un error,
  // quien escribe el bot sabría que hay una trampa y la esquivaría.
  if (texto(cuerpo[CAMPO_TRAMPA])) return responder({ ok: true });

  const cola = texto(cuerpo.cola);
  if (!['negocios', 'clasificados', 'promociones'].includes(cola)) {
    return responder({ ok: false, mensaje: 'Solicitud mal formada.' }, 400);
  }

  // --- límite por huella ---------------------------------------------------
  // Contar aquí y anotar después NO servía: con veinte peticiones a la vez, las
  // veinte leen el contador antes de que ninguna haya escrito, y pasaron 18 de
  // 20 cuando el límite eran 5. Es justo el caso que importa, porque un script
  // que inunde lo hará en paralelo. La base lo hace ahora en una sola operación,
  // con un cerrojo por huella.
  const ip = peticion.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
  const h = await huella(ip);
  const { data: permitido } = await db.rpc('permitir_envio', {
    p_huella: h,
    p_cola: cola,
    p_limite: LIMITE.envios,
    p_minutos: LIMITE.minutos,
  });

  if (permitido === false) {
    return responder(
      { ok: false, campo: null, mensaje: 'Recibimos varias solicitudes tuyas hace un momento. Espera unos minutos e inténtalo de nuevo.' },
      429,
    );
  }

  // --- lo que piden las tres colas ----------------------------------------
  const estudiantes = texto(cuerpo.estudiantes);
  const acudienteNombre = texto(cuerpo.acudiente_nombre);

  if (texto(cuerpo.consentimiento) !== 'si') {
    return no('consentimiento', 'Necesitamos tu autorización para publicar.');
  }
  if (!estudiantes) return no('estudiantes', 'Escribe los nombres de tus estudiantes y su grado.');
  if (estudiantes.length > LIMITES.estudiantes.max) {
    return no('estudiantes', `Ese texto supera los ${LIMITES.estudiantes.max} caracteres.`);
  }
  if (!acudienteNombre) return no('acudiente_nombre', 'Escribe tu nombre.');
  if (acudienteNombre.length > LIMITES.acudienteNombre.max) {
    return no('acudiente_nombre', `Ese texto supera los ${LIMITES.acudienteNombre.max} caracteres.`);
  }

  /** Colombianos: entre 7 y 10 dígitos una vez quitado el +57. */
  const telefonoValido = (v: string) => {
    const digitos = v.replace(/\s/g, '').length;
    return digitos >= 7 && digitos <= 10;
  };
  const correoValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const comun = {
    estudiantes,
    acudiente_nombre: acudienteNombre,
    consentimiento: true,
  };

  try {
    if (cola === 'clasificados') {
      const descripcion = texto(cuerpo.desc);
      const telefono = normalizarTelefono(texto(cuerpo.phone));
      const correo = texto(cuerpo.email).toLowerCase();

      if (!texto(cuerpo.cat)) return no('cat', 'Elige qué quieres publicar.');
      if (!descripcion) return no('desc', 'Escribe tu anuncio.');
      if (descripcion.length > 280) return no('desc', 'Ese texto supera los 280 caracteres.');
      if (!telefonoValido(telefono)) return no('phone', 'Ese teléfono parece incompleto.');
      if (!correoValido(correo)) return no('email', 'Revisa el correo, parece incompleto.');

      const { error } = await db.from('solicitudes_clasificados').insert({
        ...comun,
        cat: texto(cuerpo.cat),
        descripcion,
        telefono,
        correo,
      });
      if (error) throw error;
    } else if (cola === 'promociones') {
      const titulo = texto(cuerpo.titulo);
      const descripcion = texto(cuerpo.descripcion);
      const telefono = normalizarTelefono(texto(cuerpo.telefono));
      const desdeF = texto(cuerpo.vigente_desde);
      const hastaF = texto(cuerpo.vigente_hasta);

      if (!texto(cuerpo.negocio)) return no('negocio', 'Dinos de qué negocio es la promoción.');
      if (!titulo) return no('titulo', 'Ponle un título a la promoción.');
      if (!descripcion) return no('descripcion', 'Cuéntanos en qué consiste.');
      if (descripcion.length > 280) return no('descripcion', 'Ese texto supera los 280 caracteres.');
      if (!telefonoValido(telefono)) return no('telefono', 'Ese teléfono parece incompleto.');
      if (!desdeF || !hastaF) return no('vigente_hasta', 'Dinos entre qué fechas es válida.');
      if (hastaF < desdeF) return no('vigente_hasta', 'La fecha final no puede ser anterior a la inicial.');

      const { error } = await db.from('solicitudes_promociones').insert({
        ...comun,
        acudiente_correo: texto(cuerpo.acudiente_correo).toLowerCase(),
        negocio: texto(cuerpo.negocio),
        titulo,
        descripcion,
        condiciones: texto(cuerpo.condiciones) || null,
        telefono,
        vigente_desde: desdeF,
        vigente_hasta: hastaF,
      });
      if (error) throw error;
    } else {
      // negocios
      const nombre = texto(cuerpo.negocio_nombre);
      const descripcion = texto(cuerpo.descripcion);
      const telAcudiente = normalizarTelefono(texto(cuerpo.acudiente_telefono));
      const telNegocio = normalizarTelefono(texto(cuerpo.negocio_telefono));
      const correo = texto(cuerpo.acudiente_correo).toLowerCase();

      if (!telefonoValido(telAcudiente)) return no('acudiente_telefono', 'Ese teléfono parece incompleto.');
      if (!correoValido(correo)) return no('acudiente_correo', 'Revisa el correo, parece incompleto.');
      if (!nombre) return no('negocio_nombre', 'Ponle nombre a tu negocio.');
      if (!texto(cuerpo.categoria)) return no('categoria', 'Elige una categoría.');
      if (!descripcion) return no('descripcion', 'Cuéntanos qué ofreces.');
      if (descripcion.length > LIMITES.descripcion.max) {
        return no('descripcion', `Ese texto supera los ${LIMITES.descripcion.max} caracteres.`);
      }
      if (!telefonoValido(telNegocio)) return no('negocio_telefono', 'Ese teléfono parece incompleto.');
      // La dirección no se exige: media docena de los negocios del Directorio no
      // tienen local —consultoría, servicios a domicilio, ventas por Instagram—
      // y exigirla los obligaba a inventarse algo. Los que escribieron «no
      // aplica» lo dejan dicho: la fila vacía es más honesta que ese relleno.

      const foto = cuerpo.foto;
      if (!(foto instanceof File) || foto.size === 0) return no('foto', 'Sube una foto de tu negocio.');
      if (foto.size > 4 * 1024 * 1024) return no('foto', 'La foto pesa demasiado.');

      // La foto va a Storage ANTES de insertar: si falla la subida, no queremos
      // una fila apuntando a un archivo que no existe. Al revés —fila primero—
      // dejaría fichas huérfanas que hay que limpiar a mano.
      const ext = (foto.name.split('.').pop() ?? 'webp').toLowerCase();
      const ruta = `pendientes/${crypto.randomUUID()}.${ext}`;
      const { error: errorFoto } = await db.storage
        .from('fotos')
        .upload(ruta, foto, { contentType: foto.type || 'image/webp', upsert: false });
      if (errorFoto) throw errorFoto;

      const { error } = await db.from('solicitudes_negocios').insert({
        ...comun,
        acudiente_telefono: telAcudiente,
        acudiente_correo: correo,
        nombre,
        categoria: texto(cuerpo.categoria),
        descripcion,
        telefono: telNegocio,
        // Vacía va como null y no como cadena vacía: es lo que hace que la
        // ficha publicada no dibuje la fila «Dirección» en absoluto.
        direccion: texto(cuerpo.direccion) || null,
        web: normalizarWeb(texto(cuerpo.web)) || null,
        instagram: normalizarInstagram(texto(cuerpo.instagram)) || null,
        facebook: texto(cuerpo.facebook) || null,
        foto_ruta: ruta,
      });
      if (error) {
        // La fila no entró: la foto ya subida no le sirve a nadie y solo
        // consumiría el gigabyte del plan gratuito.
        await db.storage.from('fotos').remove([ruta]);
        throw error;
      }
    }

    return responder({ ok: true });
  } catch (e) {
    // Los `check` del esquema llegan aquí: son la última red, y que salten
    // significa que la validación de arriba se dejó un caso.
    console.error('solicitud fallida', { cola, error: String(e) });
    return responder(
      { ok: false, campo: null, mensaje: 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.' },
      500,
    );
  }
});
