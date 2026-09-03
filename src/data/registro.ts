/**
 * Reglas de los campos del formulario de postulación.
 *
 * Es la fuente única: el HTML saca de aquí sus `maxlength` y `pattern`, el
 * script del cliente valida con lo mismo, y el workflow de n8n debe repetir
 * estas mismas reglas en el servidor. La validación del navegador es comodidad
 * para quien llena el formulario, nunca la defensa: cualquiera puede saltársela.
 */

export const LIMITES = {
  /** Nombres de los estudiantes y su grado, en un solo campo. Da para dos o
   *  tres hijos: "Valeria Gómez 11B, Antonia Ruiz 7A". */
  estudiantes: { max: 150 },
  acudienteNombre: { max: 80 },
  negocioNombre: { max: 60 },
  descripcion: { max: 200 },
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
