-- =============================================================================
-- FLI FBC · permisos y políticas
--
-- Se ejecuta después de 01-esquema.sql.
--
-- Dos capas distintas, y conviene no confundirlas:
--
--   GRANT  decide si un rol puede TOCAR la tabla.
--   RLS    decide QUÉ FILAS ve de las que puede tocar.
--
-- Sin GRANT, la política no llega a evaluarse. Con GRANT pero sin política,
-- no se ve ninguna fila. Hacen falta las dos.
--
-- El proyecto se creó con "Automatically expose new tables" desmarcado, así que
-- ninguna tabla nace accesible: todo lo que se abre, se abre aquí y a la vista.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS encendido en todo
-- -----------------------------------------------------------------------------
-- El proyecto ya tiene el disparador de RLS automática, pero se declara igual:
-- es idempotente, y deja escrito que la intención era esta y no un descuido.

alter table administradores          enable row level security;
alter table solicitudes_negocios     enable row level security;
alter table solicitudes_clasificados enable row level security;
alter table solicitudes_promociones  enable row level security;
alter table intentos_envio           enable row level security;

-- -----------------------------------------------------------------------------
-- `anon` no toca nada. A propósito.
-- -----------------------------------------------------------------------------
-- La anon key viaja en el JavaScript del sitio: es pública por diseño. Por eso
-- el rol anónimo NO recibe ni un permiso sobre las colas. Los formularios
-- escriben a través de la Edge Function, que usa la clave de servicio y valida
-- antes. Si mañana alguien saca la anon key del bundle y la usa contra la API,
-- se encuentra con la puerta cerrada, no con una política mal escrita.

revoke all on solicitudes_negocios     from anon;
revoke all on solicitudes_clasificados from anon;
revoke all on solicitudes_promociones  from anon;
revoke all on administradores          from anon;
revoke all on intentos_envio           from anon, authenticated;

-- -----------------------------------------------------------------------------
-- El panel · rol `authenticated`
-- -----------------------------------------------------------------------------

grant select, update on solicitudes_negocios     to authenticated;
grant select, update on solicitudes_clasificados to authenticated;
grant select, update on solicitudes_promociones  to authenticated;
grant select          on administradores          to authenticated;

-- Quien administra lo ve todo y lo edita todo. `es_administrador()` es la única
-- fuente: para dar o quitar acceso al panel se añade o se borra una fila de
-- `administradores`, sin tocar políticas ni desplegar nada.
create policy admin_lee_negocios on solicitudes_negocios
  for select to authenticated using (es_administrador());
create policy admin_edita_negocios on solicitudes_negocios
  for update to authenticated using (es_administrador()) with check (es_administrador());

create policy admin_lee_clasificados on solicitudes_clasificados
  for select to authenticated using (es_administrador());
create policy admin_edita_clasificados on solicitudes_clasificados
  for update to authenticated using (es_administrador()) with check (es_administrador());

create policy admin_lee_promociones on solicitudes_promociones
  for select to authenticated using (es_administrador());
create policy admin_edita_promociones on solicitudes_promociones
  for update to authenticated using (es_administrador()) with check (es_administrador());

-- Cada quien puede verse a sí mismo en la lista blanca; nadie puede ver la
-- lista entera. Así el panel sabe si mostrar la interfaz sin filtrar quiénes
-- son los demás administradores.
create policy me_veo_a_mi_mismo on administradores
  for select to authenticated using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Fase 2 · las familias ven lo suyo
-- -----------------------------------------------------------------------------
-- Estas políticas ya están activas pero hoy no devuelven nada: `autor_id` es
-- nulo en todas las filas mientras los formularios sean anónimos, y `null =
-- auth.uid()` nunca es cierto. En cuanto el formulario empiece a guardar quién
-- envió, cada familia empieza a ver el estado de lo suyo sin que haya que
-- migrar ni desplegar nada.

create policy autor_lee_sus_negocios on solicitudes_negocios
  for select to authenticated using (autor_id = auth.uid());
create policy autor_lee_sus_clasificados on solicitudes_clasificados
  for select to authenticated using (autor_id = auth.uid());
create policy autor_lee_sus_promociones on solicitudes_promociones
  for select to authenticated using (autor_id = auth.uid());

-- Que el autor pueda EDITAR lo suyo se deja para la fase 2, y no por pereza:
-- una política RLS decide qué filas se tocan, no qué columnas. Con `update`
-- concedido, un autor podría ponerse `estado = 'aprobado'` a sí mismo y saltarse
-- la revisión. Hace falta un trigger que, si quien escribe no es administrador,
-- devuelva a su valor anterior `estado`, `revisado_por`, `revisado_en`,
-- `publicado_en` y `slug`. Se escribirá junto con el resto de la fase 2.

-- -----------------------------------------------------------------------------
-- Storage · las fotos
-- -----------------------------------------------------------------------------
-- Bucket privado. La Edge Function sube con la clave de servicio, que se salta
-- RLS. Esta política es para que el panel pueda pedir URLs firmadas de las
-- fotos pendientes con la sesión de quien revisa: sin permiso de lectura sobre
-- el objeto, `createSignedUrl` falla.

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy admin_ve_fotos on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and es_administrador());

-- -----------------------------------------------------------------------------
-- Comprobación
-- -----------------------------------------------------------------------------
-- Después de ejecutar esto, en el SQL editor:
--
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
--     → las cinco tablas con rowsecurity = true
--
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon';
--     → cero filas. Si aparece alguna, algo quedó expuesto.
