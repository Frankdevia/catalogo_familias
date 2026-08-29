# Puesta en marcha de las postulaciones

Cómo queda conectado `/registrar` con n8n, el Google Sheet y este repositorio.

## El circuito

```
/registrar (este repo, estático)
   │  POST multipart
   ▼
FLI · catálogo — recibir solicitud        [n8n, id 0p44hKgK0cfPLu4q]
   │  valida · busca el código de familia · sube la foto a Drive
   ▼
Google Sheet "Solicitudes negocios"        ← aquí revisa el colegio
   │  alguien pone estado = aprobado
   ▼
FLI · catálogo — publicar aprobados        [n8n, id IR3629DzgVm4Hlhc]
   │  commitea la ficha y la foto vía API de GitHub
   ▼
push a main → EasyPanel redespliega → el negocio aparece en el catálogo
```

Los dos workflows están creados y **desactivados**. Faltan cinco cosas que solo
se pueden hacer desde las consolas.

## 1. Google Sheet "Solicitudes negocios" — ya creado

**Hecho.** El documento existe en tu Drive con las 20 columnas en su orden:

<https://docs.google.com/spreadsheets/d/1fw4W8RB55_92vxzCbzTSoolqLpK7B7bIyoV5dfcktFE/edit>

```
marca_temporal · estado · codigo_familia · grado · acudiente_nombre ·
acudiente_telefono · acudiente_correo · consentimiento · negocio_nombre ·
categoria · descripcion · negocio_telefono · direccion · web · instagram ·
facebook · foto_drive_url · notas_revision · slug · publicado_en
```

Los dos workflows ya apuntan a él. La pestaña se referencia por su **gid
(288760056)**, no por su nombre, así que puedes renombrarla —Google la dejó como
`Untitled`— sin romper nada. Lo que sí importa son los nombres de las columnas:
el workflow mapea por nombre, letra por letra.

Queda una cosa por hacer a mano: en la columna `estado`, añadir validación de
datos con `pendiente`, `aprobado` y `rechazado`. Es la única palanca que
publica algo.

> Las siete primeras columnas son datos internos. **Nunca salen de este Sheet.**
> Compártelo solo con quien revisa.

## 2. Carpeta en Drive

Crea una carpeta para las fotos pendientes y copia su id (lo que va después de
`/folders/` en la URL).

## 3. Token de GitHub

Un token *fine-grained* con acceso **solo** a `Frankdevia/catalogo_familias` y
permiso `Contents: Read and write`. Nada más.

En n8n crea una credencial de tipo **Header Auth**:

| Campo | Valor |
|---|---|
| Name | `Authorization` |
| Value | `Bearer github_pat_...` |

Y asígnala a los tres nodos HTTP Request del workflow de publicación.

## 4. Reemplazar los marcadores

Busca `CAMBIAR` en los dos workflows. Son estos:

**FLI · catálogo — recibir solicitud**

| Nodo | Qué poner |
|---|---|
| Responder rechazo | El dominio del catálogo, en la cabecera `Access-Control-Allow-Origin` |
| Responder familia no encontrada | El mismo dominio |
| Responder OK | El mismo dominio |
| Subir foto a Drive | El id de la carpeta del paso 2 |

**FLI · catálogo — publicar aprobados**

| Nodo | Qué poner |
|---|---|
| Avisar al acudiente | El dominio, en el enlace del correo |

El dominio del `Access-Control-Allow-Origin` no es un detalle: si no coincide
con el dominio real, el navegador bloquea la lectura de la respuesta y la
familia ve un error genérico aunque la solicitud se haya guardado bien.

## 5. Conectar el sitio con el webhook

Activa el workflow de recepción y copia su URL de producción, que tendrá la forma:

```
https://n8n-n8n.26zlav.easypanel.host/webhook/fli-catalogo-registro-8b31d7e2-...
```

En EasyPanel, añádela como build arg `N8N_REGISTRO_URL` y redespliega. Sin eso
la página `/registrar` se construye con el formulario deshabilitado.

## Probar antes de anunciarlo

1. Enviar el formulario con un código de familia inventado → tiene que aparecer
   el mensaje sobre el campo del código, no un error genérico.
2. Enviar uno con un código real → fila en el Sheet, foto en Drive, correo al
   colegio y correo de confirmación.
3. Poner `estado = aprobado` y ejecutar el workflow de publicación a mano.
4. **Abrir el JSON que se commiteó y confirmar que no contiene el código de
   familia, ni el nombre, ni el teléfono, ni el correo del acudiente.** El nodo
   *Empaquetar para GitHub* aborta la publicación si detecta uno de esos datos
   en la ficha, pero conviene verlo con los propios ojos la primera vez.
5. Esperar el redespliegue y ver la ficha publicada.

## Antes de abrirlo a las familias

Los seis negocios que hay en `src/content/negocios/` son **ficticios**, de
muestra. Bórralos junto con sus fotos de `src/assets/photos/biz-*.webp` y quita
la nota del pie en `src/components/Catalogo.astro`.

## Si cambia el formulario

Las reglas de validación viven en dos sitios y tienen que coincidir:
`src/data/registro.ts` en este repo y el nodo *Validar solicitud* del workflow
de recepción. La del navegador es comodidad; la del servidor es la que protege,
porque cualquiera puede enviar un POST al webhook sin pasar por la página.

Si añades una categoría en `src/data/categorias.ts`, añádela también a la lista
`CATEGORIAS` de ese nodo, o el servidor rechazará las solicitudes con la
categoría nueva.
