# Base de datos de FLI FBC

El backend del catálogo: dónde viven las solicitudes antes de publicarse y quién
puede tocarlas.

## El proyecto

| | |
|---|---|
| Nombre | `community` |
| Ref | `mjxzbjrweqkuvshcpmwv` |
| URL | `https://mjxzbjrweqkuvshcpmwv.supabase.co` |
| Región | `us-east-1` |

**Clave pública:** `sb_publishable_Q3LLVvY_rKgZxyuC5SMAsw_6nfs5O0k`. Va en el
JavaScript del sitio y es pública por diseño; no es un secreto y no hay que
esconderla. La clave secreta (`sb_secret_…`) **no se escribe nunca en el repo**:
vive en las variables de la Edge Function.

> El proyecto usa el formato nuevo de claves —`sb_publishable_` y `sb_secret_`—
> en vez de `anon` y `service_role`. Las heredadas siguen existiendo y son las
> que Supabase inyecta en las Edge Functions como `SUPABASE_ANON_KEY` y
> `SUPABASE_SERVICE_ROLE_KEY`, así que la función funciona con ambas.

El proyecto está enlazado (`supabase link`), así que se puede consultar desde la
línea de comandos sin contraseña, por la API de gestión:

```bash
supabase db query --linked "select count(*) from solicitudes_negocios"
```

## Qué hace cada archivo

| Archivo | Qué hace |
|---|---|
| `01-esquema.sql` | Tipos, las tres colas, la lista blanca de administradores, índices y triggers |
| `02-rls.sql` | Permisos (`grant`) y políticas (RLS). Es donde se decide quién ve qué |
| `03-migracion.sql` | Carga las fichas y anuncios ya publicados, para que el panel los vea desde el primer día |

Se ejecutan **en ese orden**, una sola vez. **Ya están ejecutados** en
`community` (4 de septiembre de 2026), con este resultado comprobado:

- Las cinco tablas con RLS activo.
- `anon` con **cero** permisos: leer, insertar y listar administradores con la
  clave pública devuelven `401 permission denied` en los tres casos.
- 7 negocios y 10 clasificados migrados, todos `aprobado`.
- Bucket `fotos` creado y privado.
- El `check` del grado probado en los dos sentidos: aprobar sin grado falla
  (`23514`), dejarlo `pendiente` sin grado se acepta.

Para volver a ejecutarlos —en otro proyecto, o tras un borrado— sirve tanto el
*SQL Editor* como:

```bash
supabase db query --linked -f supabase/01-esquema.sql
```

## Cómo está pensado

**El sitio público no toca esta base.** Se construye a partir de los JSON del
repositorio, así que sigue en pie aunque Supabase esté caído. Esta base es la
sala de espera: aquí llegan las solicitudes, aquí se revisan, y de aquí las saca
el cron de n8n para commitearlas al repo.

**La autorización vive en la base, no en la interfaz.** El panel es una página
estática: cualquiera puede abrirla y cualquiera puede llamar a la API. Lo que lo
hace seguro es que cada tabla tiene RLS y que las políticas preguntan por
`es_administrador()`. Para dar acceso a alguien se añade una fila a
`administradores`; para quitárselo, se borra. No hay que desplegar nada.

**El rol anónimo no tiene ni un permiso.** La *anon key* viaja en el JavaScript
del sitio —es pública por diseño—, así que los formularios no escriben con ella:
escriben a través de una Edge Function que valida y usa la clave de servicio.

## Los cuatro estados

Son los mismos que se venían escribiendo a mano en el Google Sheet, para que
nadie tenga que reaprender el circuito:

| Estado | Qué pasa |
|---|---|
| `pendiente` | Recién llegada. Nadie la ha mirado |
| `aprobado` | El cron la publica en el repo, o la republica si se editó |
| `rechazado` | No se publica. Se conserva para tener histórico |
| `retirado` | Estuvo publicada y el cron la borró del repo |

## Dos reglas que la base impone y antes no

1. **No se puede aprobar un negocio sin grado.** Antes era un `throw` dentro de
   un nodo de n8n, que salta diez minutos después, en una ejecución que nadie
   mira. Ahora es un `check` constraint: el `update` falla en el acto y el panel
   puede decirlo.
2. **Editar una ficha publicada la vuelve a publicar.** Un trigger mantiene
   `actualizado_en`, y el cron busca `actualizado_en > publicado_en`. Sin eso,
   editar no tendría ningún efecto visible.

## Las fotos

Bucket privado `fotos`. **Se borran de Storage en cuanto quedan commiteadas en
el repo**, que es donde la foto vive de verdad: 700 fotos de hasta 1,5 MB son
~1 GB, justo el límite del plan gratuito. Sin ese borrado, el bucket se llena en
la semana del lanzamiento.

## Antes de ejecutar nada

En el proyecto de Supabase:

1. **Enable Data API: sí.** Es lo que permite que el panel hable con la base.
2. **Automatically expose new tables: no.** Los permisos se dan tabla por tabla
   en `02-rls.sql`, a la vista.
3. **Enable automatic RLS: sí.** Red de seguridad contra el descuido de mañana.
4. **Proveedor Google activado**, con el dominio del sitio autorizado.

## Después de ejecutar

Añádete a la lista blanca. El `id` sale de *Authentication → Users*, después de
entrar una primera vez con Google:

```sql
insert into administradores (id, correo, nombre)
values ('<uuid del usuario>', 'frodriguez@liceoingles.edu.co', 'Frank');
```

Y comprueba que no quedó nada expuesto:

```sql
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon';
-- cero filas
```

## Una trampa: `supabase config push`

**No lo ejecutes sin revisar antes `config.toml`.** Ese comando empuja el
archivo **entero** al proyecto enlazado, y el nuestro es la plantilla por
defecto del CLI, donde `[auth.external.google]` viene **desactivado**. Correrlo
tal cual apagaría el proveedor de Google que se configuró a mano en el panel.

La configuración de autenticación —Site URL, URLs de redirección, proveedor
Google— vive hoy en el panel de Supabase, no en este repo. Si algún día se
quiere versionar, hay que trasladarla a `config.toml` **completa** antes de
empujar nada.
