/*
 * Los campos que llegan desde el Google Sheet usan `z.coerce.string()` y no
 * `z.string()`. Google Sheets devuelve las celdas numéricas como `number`, y un
 * teléfono sin comillas en un JSON publicado por n8n dejó el repositorio sin
 * poder compilar: EasyPanel no pudo desplegar y el sitio entero se quedó
 * congelado por un solo dato. Con `coerce`, el número se convierte a texto y el
 * `.regex()` sigue validando lo que de verdad importa.
 *
 * `instagram`, `familia` y `orden` se quedan como estaban: los dos primeros
 * nunca pueden ser numéricos y el tercero es número a propósito.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIAS } from './data/categorias';
import { CATEGORIAS_CLASIFICADOS } from './data/clasificados';

const negocios = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/negocios' }),
  schema: ({ image }) =>
    z.object({
      nombre: z.coerce.string(),
      categoria: z.enum(CATEGORIAS),
      descripcion: z.coerce.string(),
      /** Grado del estudiante, tal como se muestra en la tarjeta: "Familia — grado 3B". */
      familia: z.coerce.string(),
      /** Ruta relativa a este JSON, p. ej. "../../assets/photos/biz-cafe.webp". */
      foto: image(),
      /** Solo dígitos y espacios, sin indicativo: "310 456 7890". El +57 lo pone la UI. */
      telefono: z.coerce
        .string()
        .regex(/^[\d ]+$/, 'Solo dígitos y espacios, sin +57'),
      direccion: z.coerce.string(),
      /** Dominio sin protocolo: "cafecerritos.co". */
      web: z.coerce.string().optional(),
      /** Con arroba: "@cafe.cerritos". */
      instagram: z.string().startsWith('@').optional(),
      /** Nombre de la página, no una URL. */
      facebook: z.coerce.string().optional(),
      /** Menor = aparece antes. Empates se resuelven alfabéticamente. */
      orden: z.number().int().default(100),
    }),
});

const clasificados = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/clasificados' }),
  schema: z.object({
    cat: z.enum(CATEGORIAS_CLASIFICADOS),
    desc: z.coerce.string().max(280),
    /** Solo dígitos y espacios, sin indicativo: "311 222 3344". */
    phone: z.coerce
      .string()
      .regex(/^[\d ]+$/, 'Solo dígitos y espacios, sin +57'),
    email: z.coerce.string().email(),
    /**
     * Fecha ISO (AAAA-MM-DD). Solo ordena —el más nuevo primero— y no se
     * muestra en la tarjeta. Los anuncios no caducan: se retiran a mano
     * poniendo `retirado` en el Sheet.
     */
    publicado: z.string().date(),
  }),
});

const promociones = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/promociones' }),
  schema: z.object({
    /** Texto libre, no una referencia al catálogo: una familia puede ofrecer
     *  una promoción de un negocio que todavía no está publicado. */
    negocio: z.coerce.string(),
    titulo: z.coerce.string().max(80),
    desc: z.coerce.string().max(280),
    condiciones: z.coerce.string().max(200).optional(),
    /** Solo dígitos y espacios, sin indicativo. El +57 lo pone la UI. */
    telefono: z.coerce
      .string()
      .regex(/^[\d ]+$/, 'Solo dígitos y espacios, sin +57'),
    /** Fechas ISO. `hasta` es lo que hace que la promoción caduque sola: el
     *  cron la retira, y el sitio no la muestra aunque siga el archivo. */
    desde: z.string().date(),
    hasta: z.string().date(),
  }),
});

export const collections = { negocios, clasificados, promociones };
