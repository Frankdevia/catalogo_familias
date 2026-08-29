import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIAS } from './data/categorias';

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

export const collections = { negocios };
