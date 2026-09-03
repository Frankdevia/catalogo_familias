# Puesta en marcha de las postulaciones

Cómo queda conectado `/registrar` con n8n, el Google Sheet y este repositorio.

## El circuito

```
/registrar (este repo, estático)
   │  POST multipart
   ▼
FLI · catálogo — recibir solicitud        [n8n, id 0p44hKgK0cfPLu4q]
   │  valida · sube la foto a Drive
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
marca_temporal · estado · estudiantes · grado · acudiente_nombre ·
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
todos modos. Lo que protege el endpoint es el campo trampa y,
sobre todo, la aprobación humana: ya no hay ninguna comprobación automática
de que quien escribe pertenezca al colegio.

### Si cambia la URL del webhook

Pasa si se borra y recrea el workflow de recepción. Hay que actualizar el valor
por defecto en `src/pages/registrar.astro` y volver a desplegar.

## Cómo se valida ahora la identidad

**A mano, al revisar.** El formulario pide *"Nombres de tus estudiantes y su
grado"* en un solo campo libre, que llega a la columna `estudiantes` del Sheet.
No hay ninguna consulta automática contra la base del colegio.

Quien revisa hace dos cosas antes de aprobar:

1. **Comprueba que esos estudiantes existen** y que el grado cuadra.
2. **Escribe el grado en la columna `grado`.** Llega vacía a propósito. Es el
   único dato de toda esa sección que acaba publicado: la ficha lo muestra como
   `Familia — grado 7A`. Si se queda vacía, el workflow de publicación **se
   detiene solo** con un mensaje que lo dice, en vez de publicar `Familia —
   grado ` a medias.

**Los nombres de los estudiantes no salen nunca del Sheet.** Son datos de
menores: la lista blanca del nodo *Empaquetar para GitHub* arma la ficha campo
por campo, `estudiantes` está en la lista de claves prohibidas, y además se
comprueba que la cadena completa no aparezca en el JSON público.

> Esto cambió el 3 de septiembre de 2026. Antes había un nodo *Buscar código de
> familia* que consultaba la **Base Datos Oficial** del colegio por `Cód
> Familia` y devolvía el `Homeroom`. Se quitó junto con su `IF` y su respuesta
> de "familia no encontrada". El precio de quitarlo es que **cualquiera puede
> enviar el formulario**: la barrera pasó de automática a humana.

## Qué credencial usa cada nodo de Google

No todas usan la misma, y no es un descuido:

| Nodo | Credencial | Por qué |
|---|---|---|
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
   (`estudiantes`, `acudiente_nombre`, `acudiente_telefono`…). Es
   determinista y no puede dar falsos positivos.
2. **Por valor: el correo y los nombres de los estudiantes**. Una ficha de
   negocio no tiene campo de correo, así que si el del acudiente aparece ahí es
   una fuga de verdad. Con los estudiantes se compara la **cadena completa**, no
   cada nombre suelto: un negocio puede llamarse como una hija ("Creaciones
   Valeria") y comparar por trozos lo bloquearía para siempre.

**El teléfono no se compara por valor, y es a propósito.** La primera versión sí
lo hacía y bloqueó la publicación durante dos días: la familia había puesto el
mismo número como suyo y como el del negocio —lo normal en un negocio familiar—,
así que el valor interno aparecía legítimamente en la ficha pública y la
comprobación abortaba en cada ejecución, cada diez minutos, sin que nadie se
enterara.

Lo mismo pasaría con el nombre (un negocio puede llamarse como su dueña).
**Lo que protege de verdad es la lista blanca**: la ficha se arma
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

> **Un nodo que devuelve cero items corta el flujo sin que nadie responda.** Le
> pasó al nodo que buscaba el código de familia: si el código no existía, Google
> Sheets devolvía **cero items** —no un error—, el navegador recibía una
> respuesta vacía sin cabecera CORS, `fetch` lanzaba excepción y el formulario
> decía *"No pudimos conectarnos"* en vez del mensaje correcto. Se arregló con
> `alwaysOutputData`. Ese nodo ya no existe, pero la lección vale para cualquier
> nodo de Sheets que se añada delante de un `respondToWebhook`.

## Probar antes de anunciarlo

1. Enviar el formulario dejando vacío el campo de estudiantes → tiene que
   aparecer el mensaje sobre ese campo, no un error genérico.
2. Enviar uno completo → fila en el Sheet con la columna `estudiantes` llena,
   foto en Drive, correo al colegio con los nombres a la vista y correo de
   confirmación.
3. Poner `estado = aprobado` **sin escribir el grado** → el workflow de
   publicación tiene que detenerse y decir que falta el grado.
4. Escribir el grado, volver a ejecutar, y **abrir el JSON que se commiteó para
   confirmar que no contiene los nombres de los estudiantes, ni el nombre, ni el
   teléfono, ni el correo del acudiente.** El nodo
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
