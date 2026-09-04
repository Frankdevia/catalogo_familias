-- =============================================================================
-- FLI FBC · lo que el cron necesita para publicar
--
-- Se ejecuta después de 04-panel-admin.sql.
--
-- POR QUÉ ESTO ES UNA FUNCIÓN Y NO UNA CONSULTA DESDE n8n
--
-- La pregunta central del cron es «¿qué cambió desde la última publicación?»,
-- que en SQL es `actualizado_en > publicado_en`: **comparar dos columnas entre
-- sí**. PostgREST no sabe hacer eso —sus filtros comparan una columna con un
-- valor—, así que desde n8n habría que traerse todas las filas y filtrarlas en
-- un Code node. Con 700 familias eso es traerse la base entera cada diez
-- minutos para quedarse con dos filas.
--
-- Y hay una razón mejor: aquí vive la LISTA BLANCA. El JSON que se publica se
-- arma campo por campo, justo al lado de los datos, y no se pasa de largo la
-- fila nunca. Los nombres de los estudiantes y el contacto del acudiente no
-- pueden salir por descuido porque no hay ningún camino por el que salgan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Slugs
-- -----------------------------------------------------------------------------

-- Sin depender de la extensión `unaccent`, que no está instalada: para el
-- español basta con traducir los caracteres que de verdad aparecen.
create or replace function unaccent_simple(texto text)
returns text
language sql
immutable
as $$
  select translate(
    texto,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- "Repostería La Abuela" -> "reposteria-la-abuela". Es la misma receta que hoy
-- aplica el nodo "Preparar publicación" de n8n, para que una ficha publicada
-- antes y otra publicada ahora se llamen igual.
create or replace function slugificar(texto text)
returns text
language sql
immutable
as $$
  select left(
    trim(both '-' from
      regexp_replace(
        lower(unaccent_simple(coalesce(texto, ''))),
        '[^a-z0-9]+', '-', 'g'
      )
    ), 60);
$$;

-- -----------------------------------------------------------------------------
-- Qué hay pendiente
-- -----------------------------------------------------------------------------
--
-- Devuelve TODO lo que el cron tiene que hacer en esta pasada, ya resuelto:
-- altas, ediciones y bajas de las tres colas, en un solo objeto. n8n solo tiene
-- que traducirlo a operaciones de Git.
--
--   { "altas": [ {cola, id, slug, ruta, contenido, foto_ruta, foto_ext} … ],
--     "bajas": [ {cola, id, slug, ruta} … ] }

create or replace function pendientes_de_publicar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
-- Publicar por primera vez, o volver a publicar porque se editó. Esa segunda
-- condición es la que hace que editar en el panel tenga efecto.
neg_altas as (
  select
    'negocios' as cola,
    n.id,
    coalesce(n.slug, slugificar(n.nombre)) as slug,
    -- Solo se manda la foto si SIGUE en Storage. Una vez commiteada se borra
    -- de allí —el repo es donde vive— y se marca `foto_borrada_en`; después de
    -- eso, editar el texto no debe volver a subir la imagen.
    case when n.foto_borrada_en is null then n.foto_ruta end as foto_ruta,
    lower(coalesce(nullif(regexp_replace(n.foto_ruta, '^.*\.', ''), n.foto_ruta), 'webp')) as foto_ext,
    -- LISTA BLANCA. Campo por campo; nunca el objeto entero.
    jsonb_strip_nulls(jsonb_build_object(
      'nombre',      n.nombre,
      'categoria',   n.categoria,
      'descripcion', n.descripcion,
      'familia',     'Familia — grado ' || n.grado,
      -- El archivo NO se deduce del slug: las fichas que vinieron del diseño
      -- original se llaman `biz-cafe.webp` y compañía. Deducirlo hacía que
      -- republicar una de ellas apuntara a un archivo inexistente y tumbara el
      -- build del sitio ENTERO, no solo esa ficha.
      'foto',        '../../assets/photos/' || coalesce(
                       n.foto_archivo,
                       coalesce(n.slug, slugificar(n.nombre)) || '.' ||
                       lower(coalesce(nullif(regexp_replace(n.foto_ruta, '^.*\.', ''), n.foto_ruta), 'webp'))
                     ),
      'telefono',    n.telefono,
      'direccion',   n.direccion,
      'web',         n.web,
      'instagram',   n.instagram,
      'facebook',    n.facebook,
      'orden',       n.orden
    )) as contenido
  from solicitudes_negocios n
  where n.estado = 'aprobado'
    and (n.publicado_en is null or n.actualizado_en > n.publicado_en)
    and n.grado is not null
),
cla_altas as (
  select
    'clasificados' as cola,
    c.id,
    coalesce(c.slug, lower(c.cat::text) || '-' || left(replace(c.id::text, '-', ''), 8)) as slug,
    null::text as foto_ruta,
    null::text as foto_ext,
    jsonb_build_object(
      'cat',       c.cat,
      'desc',      c.descripcion,
      'phone',     c.telefono,
      'email',     c.correo,
      'publicado', to_char(coalesce(c.publicado_en, now()) at time zone 'America/Bogota', 'YYYY-MM-DD')
    ) as contenido
  from solicitudes_clasificados c
  where c.estado = 'aprobado'
    and (c.publicado_en is null or c.actualizado_en > c.publicado_en)
),
-- Bajas: se retiró y el cron todavía no ha borrado el archivo.
neg_bajas as (
  select 'negocios' as cola, id, slug, foto_ruta,
         lower(coalesce(nullif(regexp_replace(foto_ruta, '^.*\.', ''), foto_ruta), 'webp')) as foto_ext
  from solicitudes_negocios
  where estado = 'retirado' and publicado_en is not null and retirado_en is null and slug is not null
),
cla_bajas as (
  select 'clasificados' as cola, id, slug, null::text as foto_ruta, null::text as foto_ext
  from solicitudes_clasificados
  where estado = 'retirado' and publicado_en is not null and retirado_en is null and slug is not null
)
select jsonb_build_object(
  'altas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'cola', cola, 'id', id, 'slug', slug,
      'ruta', 'src/content/' || cola || '/' || slug || '.json',
      'contenido', contenido,
      'foto_ruta', foto_ruta,
      'ruta_foto', case when foto_ruta is not null
                        then 'src/assets/photos/' || slug || '.' || foto_ext end
    ))
    from (select * from neg_altas union all select * from cla_altas) t
  ), '[]'::jsonb),
  'bajas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'cola', cola, 'id', id, 'slug', slug,
      'ruta', 'src/content/' || cola || '/' || slug || '.json',
      'ruta_foto', case when foto_ruta is not null
                        then 'src/assets/photos/' || slug || '.' || foto_ext end
    ))
    from (select * from neg_bajas union all select * from cla_bajas) t
  ), '[]'::jsonb)
);
$$;

-- -----------------------------------------------------------------------------
-- Sellar el resultado
-- -----------------------------------------------------------------------------
--
-- Se llama DESPUÉS de que el commit haya salido bien. Si el commit falla, no se
-- sella nada y la siguiente pasada lo reintenta: es preferible publicar dos
-- veces —que es inocuo, el contenido es el mismo— a dar por publicado algo que
-- no llegó.

create or replace function sellar_publicados(ids_negocios uuid[], ids_clasificados uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update solicitudes_negocios
     set publicado_en = now(),
         slug = coalesce(slug, slugificar(nombre)),
         retirado_en = null,
         -- La foto ya está commiteada: el repo es donde vive. Se marca aquí y
         -- la función la borra de Storage, que es lo que impide que el gigabyte
         -- del plan gratuito se llene en la semana del lanzamiento.
         foto_borrada_en = case when foto_ruta is not null then now() else foto_borrada_en end,
         -- Queda registrado con qué nombre entró al repositorio, para no tener
         -- que deducirlo nunca más.
         foto_archivo = case
           when foto_ruta is not null
           then coalesce(slug, slugificar(nombre)) || '.' ||
                lower(coalesce(nullif(regexp_replace(foto_ruta, '^.*\.', ''), foto_ruta), 'webp'))
           else foto_archivo end
   where id = any(ids_negocios);

  update solicitudes_clasificados
     set publicado_en = now(),
         slug = coalesce(slug, lower(cat::text) || '-' || left(replace(id::text, '-', ''), 8)),
         retirado_en = null
   where id = any(ids_clasificados);
end;
$$;

create or replace function sellar_retirados(ids_negocios uuid[], ids_clasificados uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `retirado_en` es lo que le dice al trigger de borrado que ya es seguro
  -- borrar la fila: el archivo ya no está en el repositorio.
  update solicitudes_negocios     set retirado_en = now() where id = any(ids_negocios);
  update solicitudes_clasificados set retirado_en = now() where id = any(ids_clasificados);
end;
$$;

-- -----------------------------------------------------------------------------
-- Las promociones caducan solas
-- -----------------------------------------------------------------------------
-- Una sección de promociones sin caducidad se pudre en un mes. El cron llama a
-- esto en cada pasada; lo que pase a `retirado` lo recoge la lógica de bajas.

create or replace function caducar_promociones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update solicitudes_promociones
     set estado = 'retirado',
         notas_revision = coalesce(notas_revision || ' · ', '') || 'Retirada automáticamente al vencer.'
   where estado = 'aprobado'
     and vigente_hasta < (now() at time zone 'America/Bogota')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Solo el rol de servicio ejecuta esto: es el cron, no el navegador.
revoke execute on function pendientes_de_publicar() from anon, authenticated;
revoke execute on function sellar_publicados(uuid[], uuid[]) from anon, authenticated;
revoke execute on function sellar_retirados(uuid[], uuid[]) from anon, authenticated;
revoke execute on function caducar_promociones() from anon, authenticated;
