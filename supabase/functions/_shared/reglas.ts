/**
 * Reglas de los campos de los formularios.
 *
 * Es la fuente única, y la usan los dos lados: el HTML saca de aquí sus
 * `maxlength` y `pattern`, el script del navegador valida con lo mismo, y la
 * Edge Function las vuelve a aplicar en el servidor. La validación del
 * navegador es comodidad para quien llena el formulario, nunca la defensa:
 * cualquiera puede saltársela mandando un POST a mano.
 *
 * ---
 *
 * POR QUÉ ESTE ARCHIVO VIVE AQUÍ Y NO EN `src/`
 *
 * Porque de los dos empaquetadores que lo tienen que leer, este es el estricto.
 * El de Supabase construye la función dentro de un contenedor que solo
 * garantiza lo que cuelga de `supabase/functions/` —`_shared/` es el patrón que
 * recomienda su documentación—, mientras que Vite puede importar cualquier
 * archivo dentro de la raíz del proyecto. Así que la fuente única se pone donde
 * manda el rígido y el flexible la alcanza; al revés se rompe en el despliegue,
 * y se rompe tarde.
 *
 * `src/data/registro.ts` reexporta todo esto, así que los componentes y los
 * scripts del sitio siguen importando de donde siempre.
 *
 * Condición para que esto siga funcionando: **este archivo no puede importar
 * nada ni usar APIs del navegador.** Solo constantes y funciones puras. Si
 * algún día necesita `document` o un paquete de npm, deja de poder correr en
 * Deno y hay que replantear el reparto.
 */

export const LIMITES = {
  /** Nombres de los estudiantes y su grado, en un solo campo. Da para dos o
   *  tres hijos: "Valeria Gómez 11B, Antonia Ruiz 7A". */
  estudiantes: { max: 150 },
  acudienteNombre: { max: 80 },
  negocioNombre: { max: 60 },
  /* 1.200 y no 200: el límite viejo estaba pensado para que una tarjeta del
     catálogo no se descuadrara, y se le aplicó también a la ficha, donde sobra
     sitio. Al importar el Directorio, seis de doce descripciones quedaron
     cortadas y una pasó de 1.153 caracteres a 200 —texto que había escrito la
     familia sobre su propio negocio—.
     La tarjeta ahora recorta por LÍNEAS, así que el largo ya no la descuadra.
     1.200 porque es lo que mide la más larga que existe: un campo sin techo
     invita a pegar un folleto entero. */
  descripcion: { max: 1200 },
  direccion: { max: 120 },
  web: { max: 80 },
  instagram: { max: 40 },
  facebook: { max: 80 },
} as const;

/** Teléfonos colombianos: 7 a 10 dígitos, con o sin espacios. */
export const PATRON_TELEFONO = '[0-9 ]{7,13}';

/** Foto: lo que se acepta del navegador y el techo tras comprimir. */
export const FOTO = {
  /** Antes de comprimir. Una foto de celular ronda los 3-12 MB. */
  maxBytesOriginal: 15 * 1024 * 1024,
  /** Después de comprimir en el navegador. */
  maxBytesEnviada: 1.5 * 1024 * 1024,
  /** Ancho máximo tras redimensionar; suficiente para la ficha a 2x. */
  anchoMaximo: 1600,
  calidad: 0.82,
  accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
} as const;

/**
 * Campo trampa. Un bot rellena todos los inputs que encuentra; una persona no
 * ve este porque está oculto. Si llega con contenido, el servidor descarta la
 * solicitud sin decir por qué.
 */
export const CAMPO_TRAMPA = 'sitio_web_confirmacion';

/** Normaliza "+57 310 456 7890" a "310 456 7890", que es lo que valida el
 *  esquema del catálogo en src/content.config.ts. */
export function normalizarTelefono(valor: string): string {
  return valor
    .replace(/^\s*\+?57\s*/, '')
    .replace(/[^\d ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quita el protocolo y la barra final: "https://cafe.co/" -> "cafe.co". */
export function normalizarWeb(valor: string): string {
  return valor.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** Asegura la arroba: "cafe.cerritos" -> "@cafe.cerritos". */
export function normalizarInstagram(valor: string): string {
  const limpio = valor.trim().replace(/^@+/, '').replace(/^.*instagram\.com\//i, '');
  return limpio ? `@${limpio.replace(/\/+$/, '')}` : '';
}
