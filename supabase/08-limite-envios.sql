-- =============================================================================
-- FLI FBC · el limitador de envíos, arreglado
--
-- Se ejecuta después de 07-cron.sql.
--
-- DOS FALLOS QUE DESTAPÓ LA PRUEBA DE CARGA
--
-- 1. NO SERVÍA CON CONCURRENCIA. La función contaba los intentos y después
--    insertaba el suyo. Con veinte peticiones a la vez, las veinte leen el
--    contador antes de que ninguna haya escrito, así que pasaron 18 de 20
--    cuando el límite eran 5. Y es exactamente el caso que importa: un script
--    que inunde lo hará en paralelo, no en fila.
--
--    Se arregla contando e insertando en la MISMA operación, con un cerrojo
--    por huella. El cerrojo es de transacción, así que se suelta solo, y solo
--    serializa a quien comparte huella: dos familias distintas no se esperan.
--
-- 2. EL LÍMITE ERA DEMASIADO BAJO PARA LA REALIDAD. Cinco envíos por IP cada
--    diez minutos parece razonable hasta que se recuerda que **un colegio
--    entero sale por la misma IP**. Si el lanzamiento se anuncia en una reunión
--    y veinte familias llenan el formulario desde el wifi del Liceo, con el
--    límite viejo pasan cinco y las otras quince ven un error que no es suyo.
--    Se sube a 30, que sigue parando a un script y no castiga a una sala llena.
-- =============================================================================

create or replace function permitir_envio(
  p_huella  text,
  p_cola    text,
  p_limite  integer default 30,
  p_minutos integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previos integer;
begin
  -- Serializa solo a quien comparte huella. Es de transacción: se suelta al
  -- terminar, sin riesgo de quedarse tomado si algo falla.
  perform pg_advisory_xact_lock(hashtext(p_huella));

  select count(*) into previos
    from intentos_envio
   where huella = p_huella
     and creado_en > now() - make_interval(mins => p_minutos);

  if previos >= p_limite then
    return false;
  end if;

  insert into intentos_envio (huella, cola) values (p_huella, p_cola);
  return true;
end;
$$;

revoke execute on function permitir_envio(text, text, integer, integer) from anon, authenticated;

-- La limpieza evita que la tabla crezca sin fin: solo interesa la ventana
-- reciente, y una fila de hace un mes no dice nada de nadie.
create or replace function limpiar_intentos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from intentos_envio where creado_en < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;

select cron.unschedule('limpiar-intentos')
 where exists (select 1 from cron.job where jobname = 'limpiar-intentos');

select cron.schedule('limpiar-intentos', '17 4 * * *', $cron$ select limpiar_intentos(); $cron$);
