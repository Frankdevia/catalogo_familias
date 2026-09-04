-- =============================================================================
-- FLI FBC · el nombre real del archivo de la foto
--
-- Se ejecuta después de 05-publicacion.sql.
--
-- EL FALLO QUE ARREGLA
--
-- `pendientes_de_publicar()` construía la ruta de la foto como
-- `<slug>.<extensión>`, dando por hecho que el archivo se llama como la ficha.
-- Es cierto para todo lo que publica el circuito nuevo, pero NO para las seis
-- fichas que vinieron del diseño original, cuyas fotos se llaman `biz-cafe`,
-- `biz-foto`, `biz-tejidos`…
--
-- Consecuencia: al republicar una de ellas —editarla en el panel basta— la
-- ficha pasaba a apuntar a un archivo inexistente y **el build del sitio entero
-- fallaba**, con lo que dejaba de desplegarse todo, no solo esa ficha. Ya pasó
-- con «Estudio Fotografía Luz»: cuatro construcciones seguidas en rojo.
--
-- La ruta deja de deducirse y pasa a guardarse.
-- =============================================================================

alter table solicitudes_negocios add column if not exists foto_archivo text;

comment on column solicitudes_negocios.foto_archivo is
  'Nombre del archivo en src/assets/photos/. No se deduce del slug: las fichas del diseño original no lo cumplen.';

update solicitudes_negocios as n set foto_archivo = v.archivo
  from (values
    ('cafe-de-origen-cerritos', 'biz-cafe.webp'),
    ('coaching-liderazgo', 'coaching-liderazgo.webp'),
    ('contaplus-asesores', 'biz-contaplus.webp'),
    ('estudio-fotografia-luz', 'biz-foto.webp'),
    ('fisio-activa', 'biz-fisio.webp'),
    ('reposteria-la-abuela', 'biz-reposteria.webp'),
    ('tejidos-andina', 'biz-tejidos.webp')
  ) as v(slug, archivo)
 where n.slug = v.slug;
