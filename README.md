# Apoye a Nuestras Familias

Catálogo de negocios de las familias de la **Fundación Liceo Inglés**.
Sitio estático construido con [Astro](https://astro.build), a partir del diseño
`Apoye a Nuestras Familias v4` y del design system de Liceo Inglés.

## Requisitos

Node.js 20 o superior (probado con 24).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Servidor local en http://localhost:4321 |
| `npm run build` | Verifica tipos y genera el sitio en `dist/` |
| `npm run preview` | Sirve `dist/` para revisar el build |
| `npm run check` | Solo la verificación de tipos |

## Añadir un negocio

1. Copia la foto a `src/assets/photos/`. Cuanto más grande mejor: Astro genera
   las versiones pequeñas, pero **nunca agranda** una foto pequeña.
2. Crea `src/content/negocios/<slug>.json`. El nombre del archivo es la URL:
   `mi-negocio.json` → `/negocio/mi-negocio/`.

```json
{
  "nombre": "Panadería El Trigal",
  "categoria": "Gastronomía",
  "descripcion": "Pan artesanal horneado a diario. Pedidos por encargo.",
  "familia": "Familia — grado 4A",
  "foto": "../../assets/photos/panaderia-el-trigal.webp",
  "telefono": "310 000 0000",
  "direccion": "Cra 10 # 20-30, Pereira",
  "web": "eltrigal.co",
  "instagram": "@panaderia.eltrigal",
  "facebook": "Panadería El Trigal",
  "orden": 7
}
```

Obligatorios: `nombre`, `categoria`, `descripcion`, `familia`, `foto`,
`telefono`, `direccion`. Opcionales: `web`, `instagram`, `facebook`, `orden`
(menor = aparece antes; por defecto 100).

`npm run build` falla con un mensaje claro si algún campo está mal: es la red de
seguridad, no la esquives.

### Categorías

Están en `src/data/categorias.ts` y son la única fuente de verdad: el esquema
valida contra esa lista y los chips del filtro se generan de ahí. Para añadir
una, agrégala al array — el chip aparece solo cuando tiene al menos un negocio.

## Datos de la Fundación

Teléfonos, dirección, correo, el enlace de inscripción y las cinco formas de
apoyar están en `src/data/sitio.ts`.

> **Pendiente antes de publicar:** `signupUrl` es `'#'`. Reemplázalo por el
> formulario real de inscripción.

## Estructura

```
src/
├─ assets/photos/     Fotos originales (las procesa astro:assets)
├─ components/        Secciones y tarjetas, cada una con su <style> scoped
├─ content/negocios/  Un JSON por negocio
├─ data/              categorias.ts, sitio.ts, negocio.ts (helpers)
├─ layouts/           BaseLayout.astro
├─ pages/             index, 404 y /negocio/[slug]
├─ scripts/           catalogo.ts — filtro y modal (todo el JS del sitio)
└─ styles/
   ├─ tokens/         Copia LITERAL del design system. No editar.
   └─ global.css      Reset, utilidades y ajustes propios
```

Los archivos de `styles/tokens/` vienen del design system de Liceo Inglés. Si
algo no encaja, ajústalo en `global.css` o en el componente — nunca tocando un
token, o la próxima sincronización del design system borrará el cambio.

## Cómo funciona el catálogo

- **Todas** las tarjetas se generan en el HTML. El filtro por categoría solo
  oculta y muestra, así que el sitio funciona sin JavaScript y Google lo indexa
  completo.
- La categoría activa va en la URL (`?cat=Gastronomía`), así que un filtro se
  puede compartir y sobrevive a una recarga. Una categoría desconocida cae en
  "Todos".
- Al hacer clic en una tarjeta se abre un `<dialog>` nativo — foco atrapado y
  cierre con `Esc` sin código extra. Sin JavaScript, ese mismo clic navega a la
  ficha `/negocio/<slug>/`, que además es la versión indexable y compartible.
- Todo el JavaScript del sitio son ~2.3 KB, incrustados en el HTML.

## Despliegue

Genera archivos estáticos: sirve `dist/` con cualquier servidor web.

```bash
npm run build
DESTINO_SSH=usuario@servidor:/var/www/catalogo npm run deploy
```

`npm run deploy` hace `rsync --delete`, es decir **borra en el servidor lo que no
esté en `dist/`**. Apunta a un directorio dedicado al catálogo, nunca a la raíz
de otro sitio.

### Antes del primer despliegue

En `astro.config.mjs`:

1. `site` está como `https://liceoingles.edu.co`. Ponlo con el dominio real: de
   ahí salen el sitemap, las URL canónicas y las etiquetas Open Graph.
2. Si el catálogo vive en un subdirectorio (`/apoye-familias/`), añade
   `base: '/apoye-familias'`. Sin eso, todos los enlaces y las imágenes apuntan
   a la raíz y dan 404.

## Notas sobre los recursos importados

- Los tokens, los dos logos y las seis fotos de negocios se importaron íntegros
  del proyecto de diseño.
- `assets/photos/cta-negocio.webp` y `cta-tecnologia.webp` superaban el límite de
  descarga de la API de diseño y llegaron incompletas. Se recuperaron y se les
  recortó la franja inferior dañada (1920x973 y 1920x1053 en vez de 1920x1097).
  Como son fondos a sangre con `object-fit: cover`, el recorte no se nota. Si
  quieres los originales exactos, expórtalos del proyecto de diseño y
  reemplázalos en `src/assets/photos/`.
- `support.js` e `image-slot.js` son utilidades del canvas de Claude Design; se
  leyeron para entender el comportamiento pero no forman parte del sitio.
