import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIAS } from './data/categorias';
import { CATEGORIAS_CLASIFICADOS } from './data/clasificados';

const negocios = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/negocios' }),
  schema: ({ image }) =>
    z.object({
      nombre: z.string(),
      categoria: z.enum(CATEGORIAS),
      descripcion: z.string(),
      /** Grado del estudiante, tal como se muestra en la tarjeta: "Familia — grado 3B". */
      familia: z.string(),
      /** Ruta relativa a este JSON, p. ej. "../../assets/photos/biz-cafe.webp". */
      foto: image(),
      /** Solo dígitos y espacios, sin indicativo: "310 456 7890". El +57 lo pone la UI. */
      telefono: z.string().regex(/^[\d ]+$/, 'Solo dígitos y espacios, sin +57'),
      direccion: z.string(),
      /** Dominio sin protocolo: "cafecerritos.co". */
      web: z.string().optional(),
      /** Con arroba: "@cafe.cerritos". */
      instagram: z.string().startsWith('@').optional(),
      /** Nombre de la página, no una URL. */
      facebook: z.string().optional(),
      /** Menor = aparece antes. Empates se resuelven alfabéticamente. */
      orden: z.number().int().default(100),
    }),
});

const clasificados = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/clasificados' }),
  schema: z.object({
    cat: z.enum(CATEGORIAS_CLASIFICADOS),
    desc: z.string().max(280),
    /** Solo dígitos y espacios, sin indicativo: "311 222 3344". */
    phone: z.string().regex(/^[\d ]+$/, 'Solo dígitos y espacios, sin +57'),
    email: z.string().email(),
    /**
     * Fecha ISO (AAAA-MM-DD). Solo ordena —el más nuevo primero— y no se
     * muestra en la tarjeta. Los anuncios no caducan: se retiran a mano
     * poniendo `retirado` en el Sheet.
     */
    publicado: z.string().date(),
  }),
});

export const collections = { negocios, clasificados };
