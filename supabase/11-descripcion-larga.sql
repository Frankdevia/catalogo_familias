-- =============================================================================
-- FLI FBC · la descripción deja de estar limitada a 200 caracteres
--
-- Se ejecuta después de 10-opcionales.sql.
--
-- El límite venía del formulario y estaba pensado para que una tarjeta del
-- catálogo no se descuadrara. Se le aplicó igual a la ficha, donde sobra sitio.
--
-- Al importar las doce empresas del Directorio se vio el coste: seis quedaron
-- cortadas y una pasó de 1.153 caracteres a 200. Ese texto lo había escrito
-- cada familia sobre su propio negocio.
--
-- No se añade un segundo campo «descripción larga»: obligaría a 700 familias a
-- escribir dos textos, y a alguien a redactar el resumen de las que ya están.
-- El texto es uno; lo que cambia es cuánto se enseña en cada sitio. La tarjeta
-- recorta por LÍNEAS —así todas quedan igual de altas— y la ficha lo muestra
-- entero.
--
-- 1.200 porque es lo que mide la más larga que existe. Sin techo, el campo
-- invita a pegar un folleto.
-- =============================================================================

alter table solicitudes_negocios drop constraint if exists solicitudes_negocios_descripcion_check;
alter table solicitudes_negocios add  constraint solicitudes_negocios_descripcion_check
  check (length(descripcion) between 1 and 1200);

comment on column solicitudes_negocios.descripcion is
  'Hasta 1.200 caracteres. La tarjeta del catálogo recorta por líneas; la ficha lo muestra entero.';
