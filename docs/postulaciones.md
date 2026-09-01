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

## 2. Carpeta en Drive — ya creada

**Hecho.** El nodo *Subir foto a Drive* ya apunta a ella:

<https://drive.google.com/drive/folders/1Sdgc2FH07D6jUbxDXOEAWWm6rFxnvHGO>

Es la copia para revisar. Una vez publicado el negocio, la foto definitiva vive
en este repositorio y esta carpeta queda solo como respaldo de lo pendiente.

## 3. Token de GitHub — ya conectado

**Hecho.** La credencial `GitHub catálogo FLI` (Header Auth) está asignada a los
tres nodos HTTP Request del workflow de publicación: *¿Ya existe ese slug?*,
*Subir foto al repo* y *Subir ficha al repo*.

Dos cosas que conviene recordar sobre ese token:

- **Caduca.** Cuando lo haga, el síntoma es confuso: las solicitudes se aprueban
  en el Sheet pero nunca aparecen en el catálogo, y nadie recibe un error.
  Ten la fecha en el calendario.
- **El repositorio es público**, así que el nodo que solo *lee* funcionaría
  aunque el token estuviera mal escrito. El primero que delata un problema de
  autenticación es *Subir foto al repo*, con un `401` o `403`.

## 4. Marcadores — ya reemplazados

**Hecho.** El dominio del catálogo es
`https://catologonegocios.26zlav.easypanel.host` y ya está puesto en las
cabeceras `Access-Control-Allow-Origin` de los tres nodos que responden, y en el
enlace del correo de publicación.

Va sin barra final a propósito: el navegador manda el `Origin` sin ella y la
comparación es exacta. Si algún día el catálogo pasa a un dominio propio del
colegio, hay que cambiarlo en esos cuatro sitios y en `SITE_URL`.

## 5. Configuración del despliegue — resuelta

No hace falta configurar nada en EasyPanel. El dominio del catálogo y la URL del
webhook son **valores por defecto en el código**:

| Dónde | Qué |
|---|---|
| `astro.config.mjs` | `SITE_URL` → dominio del catálogo |
| `src/pages/registrar.astro` | `N8N_REGISTRO_URL` → webhook de recepción |

Las variables de entorno siguen funcionando como anulación, pero **no sirven
desde EasyPanel**: sus "Variables de entorno" son del contenedor en ejecución,
no del `docker build`. Este sitio es estático y se hornea al construir, así que
esos valores nunca llegan. Si alguna vez hace falta cambiarlos por despliegue,
hay que pasarlos como *build args* al Dockerfile, no como variables de entorno.

La URL del webhook no es un secreto: acaba en el JavaScript de `/registrar` de
todos modos. Lo que protege el endpoint es la validación del código de familia,
el campo trampa y la aprobación humana.

### Si cambia la URL del webhook

Pasa si se borra y recrea el workflow de recepción. Hay que actualizar el valor
por defecto en `src/pages/registrar.astro` y volver a desplegar.

## De dónde sale la validación del código de familia

El nodo *Buscar código de familia* consulta:

- Documento **Base Datos Oficial 2025-2026**
  (`11ghCkxLQn5IJRFFZ153SXoayuPb3DJUtJUe1-32s1ZE`)
- Pestaña **BASE DATOS** (gid `955091006`)
- Columnas **`Cód Familia`** (con tilde) y **`Homeroom`**, que es el grado que
  acaba en la ficha como `Familia — grado 3B`

Es la misma fuente que usa el workflow *Student's institutional emails creator*,
que está activo. **No** es la hoja del workflow *Sync Estudiantes: Google Sheets
→ MySQL*, que está inactivo y tiene otros nombres de columna: confundirlas fue
el primer bug en producción, y el síntoma era engañoso —el formulario decía que
el código no existía cuando en realidad la consulta fallaba—.

Por eso ahora el workflow distingue los dos casos:

| Situación | Qué ve la familia |
|---|---|
| El código no está en la base | "Ese código no aparece en nuestros registros", señalado sobre el campo |
| La consulta al Sheet falla | "No pudimos verificar tu código en este momento", sin culpar al dato |

Si algún día cambia la base de datos oficial del colegio, hay que actualizar el
documento y la pestaña en ese nodo.

## Qué credencial usa cada nodo de Google

No todas usan la misma, y no es un descuido:

| Nodo | Credencial | Por qué |
|---|---|---|
| Buscar código de familia | `ASISTENTE TECNOLOGIA` | Es la que tiene acceso a la Base de Datos Oficial del colegio |
| Guardar solicitud | `Google Sheets account 2` | Es la cuenta con la que está compartido el Sheet de solicitudes |
| Leer aprobados / Marcar como publicado | `Google Sheets account 2` | Mismo Sheet |
| Subir foto a Drive | `Google Drive account` | Dueña de la carpeta de fotos |

El Sheet de solicitudes lo creé con la cuenta `frodriguez@` y está compartido
con `aprendizsistemas2@`, que es la cuenta detrás de `Google Sheets account 2`.
La credencial `ASISTENTE TECNOLOGIA` **no** tiene acceso a ese documento: si se
cambia el nodo para que la use, aparece un `403 PERMISSION_DENIED`.

Si algún día quieres unificarlo, la vía limpia es compartir el Sheet de
solicitudes con la cuenta de `ASISTENTE TECNOLOGIA` y cambiar los tres nodos.
Mientras tanto, funciona.

> La credencial de Google Drive caducó una vez y hubo que reconectarla. Si el
> cliente de OAuth del colegio está en modo *Testing* en Google Cloud, los
> refresh tokens caducan cada 7 días y volverá a pasar. El síntoma es
> `The credential ... needs to be reconnected` en las ejecuciones.

## La comprobación de fuga: por qué no compara teléfonos

El nodo *Empaquetar para GitHub* comprueba dos cosas antes de subir una ficha:

1. **Estructural**: que la ficha no traiga ninguna clave interna
   (`codigo_familia`, `acudiente_nombre`, `acudiente_telefono`…). Es
   determinista y no puede dar falsos positivos.
2. **Por valor, solo el correo**: una ficha de negocio no tiene campo de correo,
   así que si el del acudiente aparece ahí es una fuga de verdad.

**El teléfono no se compara por valor, y es a propósito.** La primera versión sí
lo hacía y bloqueó la publicación durante dos días: la familia había puesto el
mismo número como suyo y como el del negocio —lo normal en un negocio familiar—,
así que el valor interno aparecía legítimamente en la ficha pública y la
comprobación abortaba en cada ejecución, cada diez minutos, sin que nadie se
enterara.

Lo mismo pasaría con el nombre (un negocio puede llamarse como su dueña) y con
el código de familia (sus dígitos pueden aparecer dentro de un teléfono o una
dirección). **Lo que protege de verdad es la lista blanca**: la ficha se arma
campo por campo y nunca se pasa de largo el objeto recibido.

> Síntoma a vigilar: si una fila queda en `aprobado` con `publicado_en` vacío
> más de quince minutos, el workflow está fallando. Nadie recibe un aviso — hay
> que mirar las ejecuciones en n8n.

## Lo que aprendimos de la primera publicación real

La primera vez que el circuito publicó de verdad subió una ficha que **rompió el
build** y dejó a EasyPanel sin poder desplegar durante media hora. Antes de eso,
el mismo workflow llevaba **dos días fallando cada diez minutos en silencio**.

### La causa de fondo, que era una sola

Dentro de un nodo Code en modo *"una vez por item"*, **`$input.item.binary` no
es de fiar**. En unas ejecuciones llegaba `undefined` y en otras traía el
literal `"filesystem-v2"` —el marcador que usa n8n cuando guarda el binario en
disco— en vez de los bytes. De ahí salieron los dos síntomas:

| Síntoma | Por qué |
|---|---|
| La foto se subió con 0 bytes | `bin?.data ?? ''` → cadena vacía, que es base64 válido de cero bytes, y GitHub la aceptó |
| La ficha la llamaba `.jpg` siendo `.webp` | `bin?.mimeType` vino vacío y la extensión cayó en su valor por defecto |
| `content is not valid Base64` | En las ejecuciones donde `.data` sí traía el marcador literal |

**Regla:** ningún nodo Code debe leer binarios. Los bytes los materializa
*Extraer base64 de la foto* (`extractFromFile`) en `json.foto_b64`, y la
extensión la pasa a `json` el nodo *Guardar la extensión*.

### Las cuatro defensas que quedaron

1. **El esquema del sitio usa `z.coerce.string()`** en los campos que vienen del
   Sheet. Google Sheets devuelve las celdas numéricas como `number`; un teléfono
   sin comillas fue lo que tumbó el build. Con `coerce` ya no puede pasar,
   aunque n8n haga todo lo demás mal.
2. **`¿La foto subió bien?`** lee `content.size` de la respuesta de GitHub y
   aborta si es menor de 1 kB. Va **después** de subir la foto y **antes** de
   subir la ficha: ese orden es lo que evita dejar el repo con un JSON apuntando
   a una imagen rota.
3. **`Empaquetar para GitHub` valida** el teléfono contra el mismo patrón que el
   esquema, la extensión contra una lista, y que ningún campo llegue vacío.
4. **`FLI · alerta de fallo`** manda un correo a tecnología cuando cualquiera de
   los cinco workflows falla. Está puesto como *Error Workflow* en los cinco.

### La lección que vale para lo que venga

**El nodo que publica tiene que validar contra el mismo esquema que el sitio.**
Un JSON inválido no falla en n8n: falla en el build, en otro sistema, media hora
después y sin avisar a nadie. Cada vez que se añada un campo al catálogo hay que
tocar los dos sitios — `src/content.config.ts` y el nodo que arma la ficha.

> Si el sitio deja de actualizarse, mira primero el último commit automático.

> **`alwaysOutputData` en el nodo que busca el código de familia.** Si el código
> no existe, Google Sheets devuelve **cero items** —no un error—, el flujo se
> corta ahí y nadie responde. El navegador recibe una respuesta vacía sin
> cabecera CORS, `fetch` lanza excepción y el formulario dice *"No pudimos
> conectarnos"* en vez del mensaje correcto. Con `alwaysOutputData` el nodo emite
> un item vacío y el `IF` puede mandarlo a la rama de "familia no encontrada".

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
