-- =============================================================================
-- FLI FBC · un interruptor para las fotos que no se deben recortar
--
-- Se ejecuta después de 14-permisos-funciones.sql.
--
-- Los recuadros del catálogo son apaisados y el CSS recorta lo que sobra.
-- `src/lib/encuadre.ts` rescata solas las que reconoce como logo —fondo liso en
-- los dos bordes— y hoy acierta con 19 de 44.
--
-- Con las otras 25 no hay medida automática que sirva. Se compararon una a una
-- recortadas y enteras, y lo que decide no es la proporción ni el color del
-- borde sino QUÉ ES la imagen:
--
--   · Caiman Cocina es un volante: recortado pierde el titular y el WhatsApp.
--     Hay que verlo entero.
--   · Casa Piel es una fotografía: recortada llena el recuadro y se ve mejor
--     que encogida entre bandas.
--
-- Sus cifras son casi idénticas —planitud 0.31 y 0.39, ambas de proporción
-- 1:1— así que cualquier umbral acierta con una y falla con la otra.
--
-- Por eso lo decide quien revisa, que sí distingue un volante de una foto. La
-- regla automática sigue siendo el valor por omisión: solo hay que tocar el
-- interruptor cuando se equivoca.
-- =============================================================================

alter table solicitudes_negocios
  add column if not exists foto_completa boolean not null default false;

comment on column solicitudes_negocios.foto_completa is
  'Fuerza que la foto se vea entera, sin recortar, en la tarjeta, la ficha y el diálogo. Por omisión decide src/lib/encuadre.ts mirando los bordes de la imagen.';
