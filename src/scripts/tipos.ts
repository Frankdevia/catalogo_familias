/** Datos que el modal necesita de cada negocio. Se serializan a JSON dentro
 *  de la página y los consume `catalogo.ts` en el cliente. */
export interface NegocioModal {
  slug: string;
  nombre: string;
  categoria: string;
  familia: string;
  descripcion: string;
  /** URL de la imagen ya optimizada por astro:assets. Falta cuando la ficha
   *  se inscribió sin foto: el modal enseña la inicial, como la tarjeta. */
  foto?: string;
  /** `contener` para logos: se muestran enteros sobre `fondo` en vez de
   *  recortarse. Lo decide `src/lib/encuadre.ts` al compilar, mirando los
   *  bordes de la imagen; aquí solo viaja la conclusión. */
  encaje?: 'cubrir' | 'contener';
  fondo?: string;
  /** Medidas reales de la variante servida. El <img> del diálogo las declara
   *  fijas en el HTML porque no sabe de quién será la foto; aquí se corrigen. */
  fotoAncho?: number;
  fotoAlto?: number;
  telefono: string;
  telHref: string;
  /* Estos llegan del esquema de contenido, donde son `.nullish()`: una ficha
     sin dirección trae null y no `undefined`. El modal ya los pinta solo si
     tienen valor, así que basta con que el tipo lo diga. */
  direccion?: string | null;
  web?: string | null;
  webHref?: string;
  instagram?: string | null;
  instagramHref?: string;
  facebook?: string | null;
  /** Ruta de la ficha completa, destino sin JavaScript. */
  ficha: string;
}
