import { crearCliente, resolverSesion } from '../lib/supabase';

/**
 * Arranque del panel: sesión y permiso. Las tres colas se montan encima de
 * esto en el siguiente paso.
 *
 * El guardián de verdad no está aquí sino en las políticas de la base. Este
 * script decide qué pantalla enseñar; si alguien lo manipula desde su
 * navegador, lo único que consigue es ver un panel vacío, porque las consultas
 * seguirían sin devolver filas.
 */
const raiz = document.getElementById('panel');
if (raiz) {
  const url = raiz.dataset.supabaseUrl ?? '';
  const clave = raiz.dataset.supabaseClave ?? '';
  const db = crearCliente(url, clave);

  const vista = (nombre: string) => {
    for (const s of raiz.querySelectorAll<HTMLElement>('[data-vista]')) {
      s.hidden = s.dataset.vista !== nombre;
    }
  };

  const mostrarError = (mensaje: string) => {
    const p = raiz.querySelector<HTMLElement>('[data-error]');
    if (!p) return;
    p.textContent = mensaje;
    p.hidden = false;
  };

  const pintar = async () => {
    const sesion = await resolverSesion(db);

    if (!sesion) {
      vista('entrar');
      return;
    }
    if (!sesion.esAdministrador) {
      const donde = raiz.querySelector('[data-correo]');
      if (donde) donde.textContent = sesion.correo;
      vista('sin-permiso');
      return;
    }
    const quien = raiz.querySelector('[data-nombre]');
    if (quien) quien.textContent = sesion.nombre;
    vista('panel');
  };

  raiz.querySelector('[data-accion="entrar"]')?.addEventListener('click', async () => {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Volver a esta misma página. Se construye en tiempo de ejecución para
        // que funcione igual en el dominio de producción y en el preview local.
        redirectTo: `${location.origin}/admin/`,
      },
    });
    if (error) mostrarError('No pudimos abrir la ventana de Google. Inténtalo de nuevo.');
  });

  for (const boton of raiz.querySelectorAll('[data-accion="salir"]')) {
    boton.addEventListener('click', async () => {
      await db.auth.signOut();
      // Recargar y no solo repintar: así se limpia cualquier resto de sesión
      // que hubiera quedado en la URL o en memoria.
      location.replace('/admin/');
    });
  }

  // `detectSessionInUrl` procesa el fragmento que trae Google de vuelta y
  // dispara este evento cuando ya hay sesión utilizable. Repintar aquí evita
  // la carrera de comprobar la sesión antes de que termine de establecerse.
  db.auth.onAuthStateChange(() => {
    void pintar();
  });

  void pintar();
}
