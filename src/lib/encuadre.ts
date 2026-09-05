/**
 * Decide si una foto se recorta o se muestra entera.
 *
 * SOLO DE SERVIDOR. Importa `sharp` y lee del disco: si acaba en un archivo que
 * el navegador descarga, el bundle se rompe. Va en el frontmatter de los
 * componentes, nunca dentro de un <script>.
 *
 * EL PROBLEMA
 *
 * Los recuadros del catálogo son apaisados —2.35:1 en la tarjeta, 2:1 en la
 * ficha, 2.6:1 en el diálogo— y el CSS recorta con `object-fit: cover`. Eso
 * funciona con fotografías y destroza logos: de las once fotos publicadas,
 * seis perdían entre el 52% y el 70%, y un volante vertical perdía el 70%.
 *
 * Un directorio de negocios se llena de logos. El diseño dio por hecho lo
 * contrario.
 *
 * LA REGLA, Y POR QUÉ NO ES SOLO LA PROPORCIÓN
 *
 * «Si es alta, no la recortes» sería una regla peor: una FOTOGRAFÍA vertical
 * recortada se ve bien, y contenida entre bandas se ve peor. Lo que de verdad
 * separa un logo de una foto es que el logo va sobre fondo liso.
 *
 * Así que se miran los bordes. Si los dos son del mismo color y la imagen no es
 * claramente apaisada, se muestra entera y la banda se rellena con ESE color:
 * el logo parece hecho para el recuadro en vez de enmarcado. Con un gris neutro
 * se notaría el apaño, sobre todo en los logos de fondo morado o negro.
 *
 * Un logo sobre degradado cae del lado de «recortar», que es lo que pasa hoy:
 * la regla no empeora ningún caso, solo mejora los que puede reconocer.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { ImageMetadata } from 'astro';

export interface Encuadre {
  /** `contener`: entera, con banda. `cubrir`: llena el recuadro y se recorta. */
  encaje: 'cubrir' | 'contener';
  /** Color de la banda, solo cuando se contiene. */
  fondo?: string;
}

/**
 * Por encima de esto la imagen ya es lo bastante apaisada como para que el
 * recorte no se note, aunque tenga fondo liso.
 */
const PROPORCION_MAXIMA = 1.9;

/** Cuánta diferencia se tolera entre dos colores para llamarlos «el mismo». */
const TOLERANCIA = 18;

/**
 * Qué parte del borde tiene que ser de un color para llamarlo «liso».
 *
 * Cuatro quintos. Un logo cuyo dibujo roza el borde en algunas filas sigue
 * siendo un logo sobre fondo liso: con 0.9 se quedaba fuera uno que marcaba
 * 0.87 y que perdía el 57% al recortarse. El margen es cómodo en el otro
 * sentido: las fotografías que hay que rechazar marcan 0.57 o menos.
 */
const UNIFORMIDAD_MINIMA = 0.8;

/*
 * De la imagen procesada al archivo original.
 *
 * `ImageMetadata.src` apunta a la variante que Astro emite; para mirarle los
 * píxeles hace falta el archivo de `src/assets/photos/`.
 *
 * Se leyó el directorio con `fs` en vez de con `import.meta.glob`. El glob
 * emparejaba perfecto, pero al ser `eager` mete cada foto en el grafo de Vite y
 * Astro acaba emitiendo LOS ORIGINALES a tamaño completo, los use alguien o no:
 * 947 kB de más en `dist`, incluidas dos imágenes que ninguna página usa. Este
 * módulo solo quiere leer bytes del disco, no participar en el empaquetado.
 *
 * El emparejamiento se hace por el nombre sin extensión, que es de donde Astro
 * saca el suyo: `lula-accesorios.webp` sale como `lula-accesorios.<hash>.webp`.
 */
const CARPETA = resolve(process.cwd(), 'src/assets/photos');

const rutaPorNombre = new Map<string, string>();
try {
  for (const archivo of readdirSync(CARPETA)) {
    rutaPorNombre.set(archivo.replace(/\.[^.]+$/, ''), resolve(CARPETA, archivo));
  }
} catch (e) {
  console.warn(`[encuadre] no se pudo leer ${CARPETA}: ${String(e)}`);
}

/** `/_astro/lula-accesorios.Cx1_Zab.webp` -> `lula-accesorios`. */
function nombreOriginal(src: string): string {
  const base = (src.split('?')[0].split('/').pop() ?? '').trim();
  return base.split('.')[0];
}

/** Once imágenes leídas desde tres componentes: sin caché serían treinta y tres. */
const cache = new Map<string, Encuadre>();

/**
 * Cómo es el borde: su color y cuánto de uniforme es.
 *
 * Se usa la MEDIANA y no el promedio. Promediando, un logo cuyo dibujo llega a
 * tocar el borde en unas pocas filas arrastra el color hacia el contenido: en
 * dos de las seis fotos la banda quedaba 11 y 17 puntos por debajo del borde
 * real, y eso ya se ve como un marco. La mediana ignora esas filas sueltas.
 *
 * `uniformidad` es la fracción de píxeles que se parecen a esa mediana. Es lo
 * que distingue un fondo liso de un degradado o de una fotografía cuyos dos
 * bordes coinciden por casualidad.
 */
async function borde(archivo: string, x: number, ancho: number, alto: number) {
  const { data, info } = await sharp(archivo)
    .extract({ left: x, top: 0, width: ancho, height: alto })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canales = info.channels;
  const total = info.width * info.height;
  const columnas: number[][] = [[], [], []];
  for (let i = 0; i < total; i++) {
    for (let c = 0; c < 3; c++) columnas[c].push(data[i * canales + c]);
  }

  const mediana = columnas.map((v) => {
    v.sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  }) as [number, number, number];

  let parecidos = 0;
  for (let i = 0; i < total; i++) {
    const d = Math.max(
      Math.abs(data[i * canales] - mediana[0]),
      Math.abs(data[i * canales + 1] - mediana[1]),
      Math.abs(data[i * canales + 2] - mediana[2]),
    );
    if (d <= TOLERANCIA) parecidos++;
  }

  return { color: mediana, uniformidad: parecidos / total };
}

export async function encuadreDe(foto: ImageMetadata): Promise<Encuadre> {
  const cacheado = cache.get(foto.src);
  if (cacheado) return cacheado;

  const recortar: Encuadre = { encaje: 'cubrir' };
  const decidir = (r: Encuadre) => {
    cache.set(foto.src, r);
    return r;
  };

  const proporcion = foto.width / foto.height;
  if (proporcion >= PROPORCION_MAXIMA) return decidir(recortar);

  const archivo = rutaPorNombre.get(nombreOriginal(foto.src));
  if (!archivo) {
    console.warn(`[encuadre] sin archivo original para ${foto.src}: se recorta`);
    return decidir(recortar);
  }

  try {
    // Solo el 1% de cada lado, con un mínimo de dos píxeles para las imágenes
    // pequeñas —hay una de 240px de ancho en el catálogo—. Antes se miraba el
    // 3% y era demasiado: se metía dentro del dibujo.
    const ancho = Math.max(2, Math.round(foto.width * 0.01));
    const [izquierda, derecha] = await Promise.all([
      borde(archivo, 0, ancho, foto.height),
      borde(archivo, foto.width - ancho, ancho, foto.height),
    ]);

    // Los dos bordes tienen que ser lisos Y del mismo color. Con solo lo
    // segundo, una fotografía simétrica pasaría por logo.
    if (izquierda.uniformidad < UNIFORMIDAD_MINIMA || derecha.uniformidad < UNIFORMIDAD_MINIMA) {
      return decidir(recortar);
    }
    const diferencia = Math.max(
      ...izquierda.color.map((v, i) => Math.abs(v - derecha.color[i])),
    );
    if (diferencia >= TOLERANCIA) return decidir(recortar);

    const [r, g, b] = izquierda.color;
    return decidir({ encaje: 'contener', fondo: `rgb(${r}, ${g}, ${b})` });
  } catch (e) {
    // Leer la imagen es una mejora, no la tarea: si falla se recorta, como
    // siempre, en vez de tumbar la compilación del sitio entero. Pero se DICE.
    // Callarlo fue lo que escondió que las rutas apuntaban a un sitio vacío y
    // que ninguna foto se estaba analizando.
    console.warn(`[encuadre] no se pudo mirar ${archivo}: ${String(e)}`);
    return decidir(recortar);
  }
}

/**
 * Ancho que hay que pedirle a Astro.
 *
 * Contenida, la imagen no llena el recuadro: su alto manda y el ancho sale de
 * la proporción. Pedir el ancho del recuadro descarga de más —la tarjeta de un
 * volante vertical bajaba 800x1131 para enseñarse a 120x170— sin ganar nitidez.
 */
export function anchoUtil(foto: ImageMetadata, encuadre: Encuadre, anchoCaja: number, altoCaja: number): number {
  const deseado =
    encuadre.encaje === 'contener'
      ? Math.min(anchoCaja, Math.ceil(altoCaja * (foto.width / foto.height)))
      : anchoCaja;
  return Math.min(deseado, foto.width);
}
