/**
 * Cuándo se construyó esto, para que el panel pueda saber si va atrasado.
 *
 * El 8 de septiembre se marcó «Mostrar la foto completa» en una ficha y la foto
 * siguió recortada. El dato estaba bien en la base, bien en el repositorio y la
 * lógica devolvía lo correcto: lo que fallaba era que el sitio no se había
 * reconstruido. Desde fuera eso se ve idéntico a un interruptor que no funciona.
 *
 * El aviso que había en el panel no lo detectaba porque comparaba CUÁNTAS fichas
 * hay en la base con cuántas hay en el sitemap, y eran 52 y 52: la ficha existía
 * en los dos sitios, lo que había cambiado era su contenido. Contar es ciego a
 * eso.
 *
 * Con la hora de compilación aquí, el panel compara contra la publicación más
 * reciente y responde a la pregunta de verdad: ¿ya llegó mi cambio?
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      /* Se sella al compilar, no al servir: este archivo se genera una vez y se
         queda quieto hasta la siguiente compilación, que es justo lo que se
         quiere medir. */
      construido: new Date().toISOString(),
      // Lo pone EasyPanel al construir; en local no existe y no pasa nada.
      commit: process.env.SOURCE_COMMIT ?? process.env.GIT_COMMIT ?? null,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
