-- =============================================================================
-- FLI FBC · el panel también crea, edita y borra
--
-- Se ejecuta después de 03-migracion.sql.
--
-- Hasta aquí un administrador podía leer y actualizar. Esto le añade crear y
-- borrar, y pone la red que hace que borrar no sea peligroso.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La red: no se borra lo que está vivo en el sitio
-- -----------------------------------------------------------------------------
--
-- El cron se entera de las bajas LEYENDO la fila: busca las `retirado` y borra
-- su archivo del repositorio. Si la fila desaparece antes, el archivo se queda
-- publicado para siempre y sin rastro de por qué. Es una fuga silenciosa: nadie
-- se entera hasta que una familia pregunta por qué su negocio sigue ahí.
--
-- `retirado_en` lo escribe el cron cuando ya ha borrado el archivo. Mientras
-- esté vacío y la ficha esté publicada, la fila no se puede borrar.

alter table solicitudes_negocios     add column if not exists retirado_en timestamptz;
alter table solicitudes_clasificados add column if not exists retirado_en timestamptz;
alter table solicitudes_promociones  add column if not exists retirado_en timestamptz;

comment on column solicitudes_negocios.retirado_en is
  'Cuándo el cron borró el archivo del repositorio. Vacío = todavía está publicado.';

-- Se lee la fila como jsonb en vez de por nombre de columna. El mismo trigger
-- cuelga de tres tablas que no tienen las mismas columnas —`nombre` solo en
-- negocios, `titulo` solo en promociones—, y PL/pgSQL resuelve `old.titulo` en
-- tiempo de EJECUCIÓN: la primera versión reventaba con 42703 en las tablas que
-- no tenían ese campo, así que en clasificados fallaba todo borrado, incluso
-- los legítimos. Con `to_jsonb` un campo que no existe es simplemente null.
create or replace function impedir_borrar_publicado()
returns trigger
language plpgsql
as $$
declare
  fila jsonb := to_jsonb(old);
  etiqueta text;
begin
  if (fila->>'publicado_en') is not null and (fila->>'retirado_en') is null then
    etiqueta := coalesce(
      fila->>'nombre',
      fila->>'titulo',
      left(coalesce(fila->>'descripcion', 'esta solicitud'), 40)
    );
    raise exception
      'No se puede borrar «%» porque todavía está publicada en el sitio. Retírala primero y espera al siguiente ciclo: si se borra la fila ahora, el archivo se queda en el repositorio y nadie se entera.',
      etiqueta
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger t_negocios_no_borrar_publicado
  before delete on solicitudes_negocios
  for each row execute function impedir_borrar_publicado();

create trigger t_clasificados_no_borrar_publicado
  before delete on solicitudes_clasificados
  for each row execute function impedir_borrar_publicado();

create trigger t_promociones_no_borrar_publicado
  before delete on solicitudes_promociones
  for each row execute function impedir_borrar_publicado();

-- -----------------------------------------------------------------------------
-- Permisos y políticas
-- -----------------------------------------------------------------------------

grant insert, delete on solicitudes_negocios     to authenticated;
grant insert, delete on solicitudes_clasificados to authenticated;
grant insert, delete on solicitudes_promociones  to authenticated;

create policy admin_crea_negocios on solicitudes_negocios
  for insert to authenticated with check (es_administrador());
create policy admin_borra_negocios on solicitudes_negocios
  for delete to authenticated using (es_administrador());

create policy admin_crea_clasificados on solicitudes_clasificados
  for insert to authenticated with check (es_administrador());
create policy admin_borra_clasificados on solicitudes_clasificados
  for delete to authenticated using (es_administrador());

create policy admin_crea_promociones on solicitudes_promociones
  for insert to authenticated with check (es_administrador());
create policy admin_borra_promociones on solicitudes_promociones
  for delete to authenticated using (es_administrador());

-- -----------------------------------------------------------------------------
-- Fotos: el panel también sube y reemplaza
-- -----------------------------------------------------------------------------
-- Hasta ahora solo la Edge Function escribía en el bucket, con la clave de
-- servicio. Para poder crear un negocio desde el panel, o cambiarle la foto a
-- uno que ya existe, quien administra necesita escribir directamente.

create policy admin_sube_fotos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and es_administrador());

create policy admin_reemplaza_fotos on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and es_administrador());

create policy admin_borra_fotos on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and es_administrador());

-- -----------------------------------------------------------------------------
-- Comprobación
-- -----------------------------------------------------------------------------
--   Intentar borrar una fila publicada tiene que fallar con restrict_violation.
--   Intentar borrar una pendiente tiene que funcionar.
--   `anon` tiene que seguir con cero permisos.
