import { FOTO } from '../data/registro';

/** "352629" -> "344 KB". Para decirle a quien sube cuánto pesa lo que sube. */
export function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Redimensiona a `FOTO.anchoMaximo` y re-codifica a webp.
 *
 * Una foto de celular de 12 MB queda en ~200 KB, que es la diferencia entre que
 * el envío funcione con datos móviles y que se caiga por tiempo de espera.
 *
 * Y hay una segunda razón, que no se ve hasta que es tarde: **la foto acaba
 * commiteada en el repositorio**, y el historial de git no olvida. Un archivo
 * de 5 MB subido sin comprimir se queda ahí para siempre aunque después se
 * borre la ficha. Por eso esto lo usan los DOS caminos —el formulario público y
 * el panel—, y no solo el primero, que fue como estuvo al principio: por el
 * panel entró un JPG de 352 KB sin tocar.
 *
 * Si el navegador no sabe decodificar el formato (HEIC en Android, por
 * ejemplo), devuelve el archivo original en vez de fallar.
 */
export async function comprimirFoto(archivo: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    if (archivo.size > FOTO.maxBytesOriginal) {
      throw new Error(
        `No pudimos procesar esa imagen y pesa ${pesoLegible(archivo.size)}. ` +
          'Intenta con una foto más liviana o en formato JPG.',
      );
    }
    return archivo;
  }

  const escala = Math.min(1, FOTO.anchoMaximo / bitmap.width);
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return archivo;
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const codificar = (tipo: string) =>
    new Promise<Blob | null>((res) => lienzo.toBlob(res, tipo, FOTO.calidad));

  const blob = (await codificar('image/webp')) ?? (await codificar('image/jpeg'));
  if (!blob) return archivo;

  // Si comprimir no ayudó (imágenes ya pequeñas), se queda el original.
  return blob.size < archivo.size ? blob : archivo;
}
