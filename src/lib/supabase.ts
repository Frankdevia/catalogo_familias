import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para el navegador.
 *
 * No lee las variables de entorno por su cuenta: las recibe. El sitio es
 * estático y las variables se hornean al construir, así que la página las
 * escribe en un atributo `data-` y el script las pasa aquí. Es el mismo patrón
 * que ya usa `/registrar` con el endpoint del formulario.
 *
 * La clave publicable es pública por diseño —acaba en el JavaScript de la
 * página de todos modos—. Lo que impide que sirva para algo es que el rol
 * anónimo no tiene ni un permiso sobre las tablas: sin sesión, y sin estar en
 * `administradores`, no devuelve una sola fila. La seguridad está en la base,
 * no en esconder la clave.
 */
export function crearCliente(url: string, clave: string): SupabaseClient {
  return createClient(url, clave, {
    auth: {
      // La sesión sobrevive a recargar la página y se renueva sola.
      persistSession: true,
      autoRefreshToken: true,
      // Supabase devuelve la sesión en el fragmento de la URL tras volver de
      // Google; esto la recoge y limpia la barra de direcciones.
      detectSessionInUrl: true,
    },
  });
}

/** Lo que el panel necesita saber de quien está mirando. */
export interface Sesion {
  correo: string;
  nombre: string;
  esAdministrador: boolean;
}

/**
 * Resuelve quién está dentro y si puede administrar.
 *
 * La pregunta «¿es administrador?» se le hace a la BASE, no a la sesión: se
 * intenta leer la fila propia de `administradores`, y si RLS no la devuelve, no
 * lo es. Comprobarlo aquí es solo para decidir qué pintar; aunque alguien
 * falsee esta respuesta en su navegador, las políticas siguen sin dejarle leer
 * ni escribir una sola solicitud.
 */
export async function resolverSesion(db: SupabaseClient): Promise<Sesion | null> {
  const { data } = await db.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return null;

  const { data: fila } = await db
    .from('administradores')
    .select('correo, nombre')
    .eq('id', usuario.id)
    .maybeSingle();

  return {
    correo: usuario.email ?? '',
    nombre: fila?.nombre ?? (usuario.user_metadata?.full_name as string) ?? usuario.email ?? '',
    esAdministrador: Boolean(fila),
  };
}
