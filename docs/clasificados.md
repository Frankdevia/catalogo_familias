# Clasificados: puesta en marcha

Cómo se conecta `/clasificados/nuevo` con n8n, el Google Sheet y este
repositorio. Es el mismo circuito que los negocios, con dos pasos menos porque
no hay foto.

## El circuito

```
/clasificados/nuevo (este repo, estático)
   │  POST form-urlencoded
   ▼
FLI · clasificados — recibir solicitud     [n8n, id SLOJq085Tc6OQAlj]
   │  valida · busca el código de familia
   ▼
Sheet "Solicitudes negocios" › pestaña Clasificados   ← aquí revisa el colegio
   │  alguien pone estado = aprobado
   ▼
FLI · clasificados — publicar aprobados    [n8n, id B8GxkUgVG0OYFUen]
   │  commitea src/content/clasificados/<id>.json
   ▼
push a main → EasyPanel redespliega → el anuncio aparece en la portada

Para quitarlo: estado = retirado
   ▼
FLI · clasificados — retirar               [n8n, id 2ohPjx04nw8b3d9z]
```

Los tres están creados y **desactivados**. Falta lo de abajo.

## 1. La pestaña `Clasificados` del Sheet

En el documento
[Solicitudes negocios — Catálogo FLI](https://docs.google.com/spreadsheets/d/1fw4W8RB55_92vxzCbzTSoolqLpK7B7bIyoV5dfcktFE/edit),
crea una pestaña llamada exactamente `Clasificados` con esta primera fila:

```
marca_temporal · estado · codigo_familia · grado · acudiente_nombre ·
acudiente_correo · consentimiento · cat · desc · phone · email ·
notas_revision · id · publicado_en
```

Los nombres tienen que coincidir letra por letra: el workflow mapea por nombre.

En `estado`, validación de datos con `pendiente`, `aprobado`, `rechazado` y
`retirado`.

## 2. Activar los tres workflows

Nada más. Las credenciales ya están asignadas y el dominio ya está puesto en las
cabeceras CORS, porque se copiaron de los workflows de negocios que ya funcionan.

La URL del webhook ya está escrita como valor por defecto en
`src/pages/clasificados/nuevo.astro`, así que **no hay que configurar nada en
EasyPanel**.

## Qué se publica y qué no

Aquí la línea es distinta a la de los negocios, y conviene tenerlo claro:

| Se queda en el Sheet | Se publica en el sitio |
|---|---|
| Código de familia | Categoría (COMPRO / BUSCO / VENDO / OFREZCO) |
| Grado | Texto del anuncio |
| Nombre del acudiente | **Teléfono de contacto** |
| | **Correo de contacto** |

El teléfono y el correo **sí salen**, porque son el punto de un clasificado. Por
eso el formulario tiene una casilla de consentimiento que lo dice con esas
palabras, y el correo de confirmación lo recuerda.

El nodo *Empaquetar para GitHub* arma el JSON campo por campo desde una lista
blanca —esa es la protección real— y además comprueba que no se haya colado
ninguna **clave** interna.

Aquí no se compara nada **por valor**, a propósito: el teléfono y el correo
publicados *son* los del acudiente, así que compararlos abortaría siempre. En el
workflow de negocios una comprobación por valor de este tipo bloqueó la
publicación durante dos días (ver `docs/postulaciones.md`).

> Los correos publicados en texto plano son recolectados por rastreadores de
> spam. Se advirtió y se decidió publicarlos así. Si algún día llega spam a las
> familias, la salida es armar el `mailto:` con JavaScript en
> `Clasificados.astro`: los rastreadores leen el HTML crudo y no lo encontrarían.

## Los anuncios no caducan

Se decidió que se retiran a mano. Consecuencia práctica: **nadie recibe un aviso
cuando un anuncio envejece**. El correo de publicación le dice a la familia cómo
pedir que lo quiten, pero la sección se irá llenando de anuncios viejos si no se
revisa cada cierto tiempo.

Si más adelante se quiere caducidad automática, el campo `publicado` de cada
JSON ya guarda la fecha: bastaría con filtrar por ella en `index.astro`, sin
tocar n8n ni el Sheet.

## Si cambian las categorías

Viven en `src/data/clasificados.ts` y son la fuente única para el esquema Zod,
los chips y los badges. Si añades una, **añádela también** a la lista
`CATEGORIAS` del nodo *Validar solicitud* y a la del nodo *Empaquetar para
GitHub*, o el servidor rechazará los anuncios que la usen.

## Un detalle del nodo que valida el código

> **`alwaysOutputData` en el nodo que busca el código de familia.** Si el código
> no existe, Google Sheets devuelve **cero items** —no un error—, el flujo se
> corta ahí y nadie responde. El navegador recibe una respuesta vacía sin
> cabecera CORS, `fetch` lanza excepción y el formulario dice *"No pudimos
> conectarnos"* en vez del mensaje correcto. Con `alwaysOutputData` el nodo emite
> un item vacío y el `IF` puede mandarlo a la rama de "familia no encontrada".
