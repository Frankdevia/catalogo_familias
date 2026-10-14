-- =============================================================================
-- FLI FBC · los clasificados caducan a los 30 días
--
-- Se ejecuta después de 16-lista-blanca-foto-completa.sql.
--
-- Hasta ahora un anuncio solo salía del sitio si alguien lo retiraba a mano, y
-- nadie lo hacía: a mediados de octubre seguían en portada anuncios del 5 de
-- septiembre. Ahora cada clasificado dura 30 días desde su PRIMERA publicación.
--
-- Por qué una columna nueva y no `publicado_en`: `sellar_publicados()` la
-- reescribe cada vez que el anuncio se republica, y se republica cada vez que
-- se edita en el panel. Contar desde ahí haría que corregir una tilde le
-- regalara al anuncio otros 30 días.
--
-- El retiro no necesita nada nuevo: esto solo pasa la fila a `retirado`, y el
-- cron `publicar-catalogo`, que corre cada minuto, la recoge como baja y borra
-- su JSON del repositorio, igual que cuando se retira a mano.
-- =============================================================================

alter table solicitudes_clasificados
  add column if not exists primera_publicacion timestamptz;

comment on column solicitudes_clasificados.primera_publicacion is
  'Cuándo salió al sitio por primera vez. Desde aquí se cuentan los 30 días; editar no la mueve, volver a aprobar un retirado sí. Ver 17-caducidad-clasificados.sql.';

-- Los ya publicados cuentan desde su última publicación: es la mejor fecha que
-- hay, y en todos los anuncios actuales coincide con la primera.
update solicitudes_clasificados
   set primera_publicacion = publicado_en
 where primera_publicacion is null
   and publicado_en is not null;

-- La columna la mantiene un trigger y no `sellar_publicados()`: así no hay que
-- volver a escribir esa función ni `pendientes_de_publicar()`, que ya se
-- redefinieron varias veces y son largas.
create or replace function marcar_primera_publicacion()
returns trigger
language plpgsql
as $$
begin
  -- Volver a aprobar un anuncio retirado es publicarlo de nuevo: empieza otros
  -- 30 días. Sin esto, un anuncio vencido que se reaprueba caducaría otra vez
  -- en la siguiente pasada, sin llegar a verse.
  if old.estado = 'retirado' and new.estado = 'aprobado' then
    new.primera_publicacion := null;
  end if;

  if new.primera_publicacion is null and new.publicado_en is not null
     and new.publicado_en is distinct from old.publicado_en then
    new.primera_publicacion := new.publicado_en;
  end if;

  return new;
end;
$$;

drop trigger if exists t_clasificados_primera_publicacion on solicitudes_clasificados;
create trigger t_clasificados_primera_publicacion
  before update on solicitudes_clasificados
  for each row execute function marcar_primera_publicacion();

-- Gemela de caducar_promociones() (05-publicacion.sql).
create or replace function caducar_clasificados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update solicitudes_clasificados
     set estado = 'retirado',
         notas_revision = coalesce(notas_revision || ' · ', '') || 'Retirado automáticamente a los 30 días.'
   where estado = 'aprobado'
     and primera_publicacion < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- `from public` también, no solo anon y authenticated: ver 14-permisos-funciones.sql.
revoke execute on function caducar_clasificados() from public, anon, authenticated;
revoke execute on function marcar_primera_publicacion() from public, anon, authenticated;

-- Una vez al día basta: 30 días no necesitan precisión de minutos. 05:05 UTC
-- son las 00:05 en Bogotá, así que un anuncio vence al empezar el día.
select cron.unschedule('caducar-clasificados')
 where exists (select 1 from cron.job where jobname = 'caducar-clasificados');

select cron.schedule(
  'caducar-clasificados',
  '5 5 * * *',
  $cron$ select caducar_clasificados(); $cron$
);
