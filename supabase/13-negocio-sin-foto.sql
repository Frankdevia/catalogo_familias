-- =============================================================================
-- FLI FBC · un negocio sin foto también se publica
--
-- Se ejecuta después de 12-direccion-opcional.sql.
--
-- El sitio lleva tiempo preparado para fichas sin foto: la tarjeta y la ficha
-- dibujan la inicial sobre el navy, con el mismo hueco y el mismo recorte, para
-- que una rejilla mezclada no se vea rota. El esquema declara `foto` opcional.
--
-- Esta consulta no se enteró. Construía la ruta concatenando, y concatenar
-- nunca da null: un negocio sin foto salía con «foto»: «.../<slug>.webp»
-- apuntando a un archivo que no existe. La función de publicar lo rechazaba
-- —con razón, porque tumbaría el build entero— y esas fichas se quedaban
-- aprobadas y sin publicar para siempre, sin que nadie viera por qué.
--
-- Ahora la clave solo se emite si hay foto de verdad. `jsonb_strip_nulls`, que
-- ya envolvía el objeto, se encarga del resto: sin foto no hay clave, y sin
-- clave Astro usa el respaldo.
-- =============================================================================

create or replace function pendientes_de_publicar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $FN$

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
      -- Solo si hay foto. Concatenar nunca da null, y por eso los negocios sin
      -- foto salían apuntando a un archivo inexistente y no se publicaban
      -- nunca. `jsonb_strip_nulls` quita la clave y Astro usa el respaldo.
      'foto',        case
                       when n.foto_archivo is not null or n.foto_ruta is not null
                       then '../../assets/photos/' || coalesce(
                              n.foto_archivo,
                              coalesce(n.slug, slugificar(n.nombre)) || '.' ||
                              lower(coalesce(nullif(regexp_replace(n.foto_ruta, '^.*\.', ''), n.foto_ruta), 'webp'))
                            )
                     end,
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
pro_altas as (
  select
    'promociones' as cola,
    p.id,
    coalesce(p.slug, slugificar(p.titulo) || '-' || left(replace(p.id::text, '-', ''), 6)) as slug,
    null::text as foto_ruta,
    null::text as foto_ext,
    jsonb_strip_nulls(jsonb_build_object(
      'negocio',     p.negocio,
      'titulo',      p.titulo,
      'desc',        p.descripcion,
      'condiciones', p.condiciones,
      'telefono',    p.telefono,
      'desde',       to_char(p.vigente_desde, 'YYYY-MM-DD'),
      'hasta',       to_char(p.vigente_hasta, 'YYYY-MM-DD')
    )) as contenido
  from solicitudes_promociones p
  where p.estado = 'aprobado'
    and (p.publicado_en is null or p.actualizado_en > p.publicado_en)
),
-- Bajas: se retiró y el cron todavía no ha borrado el archivo.
neg_bajas as (
  -- El archivo a borrar sale de `foto_archivo`, no de deducirlo de `foto_ruta`.
  -- `foto_ruta` es la ruta en Storage y es NULA en las fichas migradas, que
  -- nunca pasaron por allí: al retirarlas, su foto se quedaba en el repositorio
  -- para siempre. Pasó con las seis de la maqueta.
  select 'negocios' as cola, id, slug,
         coalesce(foto_archivo,
                  slug || '.' || lower(coalesce(nullif(regexp_replace(foto_ruta, '^.*\.', ''), foto_ruta), 'webp'))
         ) as foto_ruta,
         null::text as foto_ext
  from solicitudes_negocios
  where estado = 'retirado' and publicado_en is not null and retirado_en is null and slug is not null
),
cla_bajas as (
  select 'clasificados' as cola, id, slug, null::text as foto_ruta, null::text as foto_ext
  from solicitudes_clasificados
  where estado = 'retirado' and publicado_en is not null and retirado_en is null and slug is not null
),
pro_bajas as (
  select 'promociones' as cola, id, slug, null::text as foto_ruta, null::text as foto_ext
  from solicitudes_promociones
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
    from (select * from neg_altas union all select * from cla_altas
          union all select * from pro_altas) t
  ), '[]'::jsonb),
  'bajas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'cola', cola, 'id', id, 'slug', slug,
      'ruta', 'src/content/' || cola || '/' || slug || '.json',
      'ruta_foto', case when foto_ruta is not null
                        then 'src/assets/photos/' || foto_ruta end
    ))
    from (select * from neg_bajas union all select * from cla_bajas
          union all select * from pro_bajas) t
  ), '[]'::jsonb)
);
$FN$;
