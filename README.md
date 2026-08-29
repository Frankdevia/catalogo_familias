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

El sitio es estático. El repo trae un `Dockerfile` multi-etapa que lo construye
y lo sirve con nginx — probado localmente: rutas, redirecciones, 404 y cabeceras
de caché.

### EasyPanel (desde el repositorio)

1. Crea un servicio **App** y conéctalo a `Frankdevia/catalogo_familias`, rama `main`.
2. En **Build**, elige **Dockerfile** (no Nixpacks: Nixpacks buscaría un
   `npm start` que no existe, porque aquí no hay servidor de aplicación).
3. Puerto expuesto: **80**.
4. En **Build Args** (no en variables de entorno de runtime: el dominio se
   incrusta durante el build):

   | Arg | Valor |
   |---|---|
   | `SITE_URL` | `https://catalogo.liceoingles.edu.co` — el dominio real |
   | `BASE_PATH` | Solo si cuelga de un subdirectorio, p. ej. `/apoye-familias` |
   | `N8N_REGISTRO_URL` | Webhook de n8n que recibe las postulaciones (ver *Postulación de negocios*) |

5. Añade el dominio en **Domains** y activa el certificado.

`SITE_URL` no es cosmético: de ahí salen el `sitemap.xml`, las URL canónicas y
las etiquetas Open Graph. Si se queda en el valor por defecto, Google indexa
direcciones equivocadas y los enlaces compartidos en WhatsApp apuntan mal.

Cada `git push` a `main` dispara un despliegue nuevo. Añadir un negocio es
commitear un JSON y una foto.

### Comprobar la imagen antes de subirla

```bash
docker build --build-arg SITE_URL=https://catalogo.liceoingles.edu.co -t catalogo .
docker run --rm -p 8099:80 catalogo   # http://localhost:8099
```

### Alternativa: servidor propio por rsync

Si en vez de EasyPanel se sirve desde un directorio del servidor del colegio:

```bash
SITE_URL=https://catalogo.liceoingles.edu.co \
DESTINO_SSH=usuario@servidor:/var/www/catalogo npm run deploy
```

`npm run deploy` hace `rsync --delete`, es decir **borra en el servidor lo que no
esté en `dist/`**. Apunta a un directorio dedicado al catálogo, nunca a la raíz
de otro sitio.

## Postulación de negocios

`/registrar` es el formulario que llenan las familias. Es HTML y JavaScript
estático: envía un `multipart/form-data` al webhook de n8n indicado en
`N8N_REGISTRO_URL`. **El sitio sigue siendo estático**, no hay servidor de
aplicación ni base de datos en este repo.

Si `N8N_REGISTRO_URL` no se define, la página se construye igual pero con el
formulario deshabilitado y el correo de contacto a la vista, en vez de fallar al
enviar.

Detalles que importan al tocar esta parte:

- **La lista de categorías sale de `src/data/categorias.ts`**, la misma que
  valida el catálogo. Por eso el formulario vive aquí y no en un Google Form:
  así no se pueden desincronizar.
- **La foto se comprime en el navegador** antes de enviarla (máx 1600 px, WebP).
  Una foto de celular de 12 MB llega en ~200 KB. Sin esto, un envío con datos
  móviles se cae por tiempo de espera.
- **Los valores se normalizan antes de enviarse** con las funciones de
  `src/data/registro.ts`: el teléfono pierde el `+57`, la web el `https://` y el
  Instagram gana la arroba. Es exactamente lo que exige el esquema Zod de
  `src/content.config.ts`, para que el JSON publicado valide a la primera.
- **La validación del navegador es comodidad, no seguridad.** El workflow de
  n8n tiene que repetir todas las comprobaciones: cualquiera puede enviar un
  POST al webhook sin pasar por esta página.

### Qué se publica y qué no

El repositorio es público. El formulario recoge dos grupos de datos y **solo uno
llega al repo**:

| Se queda en el Google Sheet | Se publica en el catálogo |
|---|---|
| Código de familia | Nombre, categoría, descripción del negocio |
| Nombre del acudiente | `familia`: `"Familia — grado 3B"`, sin apellido |
| Teléfono y correo del acudiente | Teléfono **del negocio**, dirección, foto, redes |

El workflow que publica arma el JSON campo por campo desde una lista blanca.
Nunca pasa de largo el objeto que recibió: así un campo nuevo en el formulario
no puede filtrarse solo a un repositorio público.

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
