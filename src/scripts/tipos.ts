/** Datos que el modal necesita de cada negocio. Se serializan a JSON dentro
 *  de la página y los consume `catalogo.ts` en el cliente. */
export interface NegocioModal {
  slug: string;
  nombre: string;
  categoria: string;
  familia: string;
  descripcion: string;
  /** URL de la imagen ya optimizada por astro:assets. */
  foto: string;
  telefono: string;
  telHref: string;
  direccion: string;
  web?: string;
  webHref?: string;
  instagram?: string;
  instagramHref?: string;
  facebook?: string;
  /** Ruta de la ficha completa, destino sin JavaScript. */
  ficha: string;
}
