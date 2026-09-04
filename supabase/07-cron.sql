-- =============================================================================
-- FLI FBC · el cron que publica solo
--
-- Se ejecuta después de 06-foto-archivo.sql.
--
-- Cada diez minutos llama a la función `publicar`, que es la que mira si hay
-- algo pendiente. Si no lo hay devuelve `sin_cambios` y no toca el repositorio,
-- así que una pasada en vacío no cuesta nada ni ensucia el historial.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La llamada usa la CLAVE PUBLICABLE, no la de servicio.
--
-- No es un descuido: la función `publicar` acepta esa clave —está comprobado— y
-- hace su trabajo con la de servicio que Supabase le inyecta por dentro. Así no
-- hay ninguna credencial sensible guardada en `cron.job`, que es una tabla
-- normal de la base y aparecería en cualquier volcado.
--
-- Y aunque alguien llamara al endpoint con esa clave pública, lo único que
-- conseguiría es publicar lo que un administrador YA aprobó, diez minutos antes
-- de lo previsto.
select cron.unschedule('publicar-catalogo')
 where exists (select 1 from cron.job where jobname = 'publicar-catalogo');

select cron.schedule(
  'publicar-catalogo',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mjxzbjrweqkuvshcpmwv.supabase.co/functions/v1/publicar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Q3LLVvY_rKgZxyuC5SMAsw_6nfs5O0k',
      'Authorization', 'Bearer sb_publishable_Q3LLVvY_rKgZxyuC5SMAsw_6nfs5O0k'
    ),
    timeout_milliseconds := 60000
  );
  $cron$
);

-- -----------------------------------------------------------------------------
-- Cómo se vigila
-- -----------------------------------------------------------------------------
--   select * from cron.job;                        -- qué hay programado
--   select * from cron.job_run_details              -- si corrió y si falló
--    order by start_time desc limit 20;
--   select * from net._http_response                -- qué respondió la función
--    order by created desc limit 20;
--
-- `cron.job_run_details` dice si el DISPARO salió, no si la publicación salió:
-- pg_net es asíncrono y devuelve un identificador al instante. Para saber qué
-- contestó la función hay que mirar `net._http_response`.
