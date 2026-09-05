-- =============================================================================
-- FLI FBC · cerrar las funciones internas
--
-- Se ejecuta después de 13-negocio-sin-foto.sql.
--
-- QUÉ ESTABA PASANDO
--
-- Postgres concede EXECUTE a PUBLIC en cada función nueva. `09-correos.sql`
-- hacía `revoke ... from anon, authenticated`, que parece suficiente y no lo es:
-- quita esas dos concesiones y deja intacta la de PUBLIC, de la que `anon`
-- hereda. El resultado es que seguían abiertas.
--
-- Abiertas ¿a quién? A cualquiera con la clave publicable, que va dentro del
-- JavaScript del sitio: es pública por diseño.
--
-- Lo comprobado desde fuera, sin sesión:
--
--   · correos_pendientes()  devolvía los correos por enviar. El aviso al
--     colegio lleva dentro NOMBRES DE ESTUDIANTES y el teléfono y correo del
--     acudiente. Es exactamente lo que no puede salir de aquí.
--   · pendientes_de_publicar()  enseñaba la cola antes de que nadie la revise.
--   · marcar_correo()  habría permitido dar por enviados correos que no salieron,
--     dejando a las familias sin aviso y sin rastro de que faltaran.
--   · sellar_publicados() / sellar_retirados()  dar por publicado o retirado lo
--     que no lo está.
--   · permitir_envio()  agotar el límite de envíos y bloquear el formulario.
--   · caducar_promociones()  vencer promociones vigentes.
--
-- Ninguna es «solo de lectura»: cinco de las siete escriben.
--
-- LA CORRECCIÓN
--
-- Se revoca en bloque y se devuelve solo lo imprescindible. Y se cambian los
-- privilegios por omisión, para que la próxima función que alguien cree no
-- vuelva a nacer abierta: es el único modo de que esto no se repita.
-- =============================================================================

revoke execute on all functions in schema public from public, anon, authenticated;

-- Lo único que se devuelve. Las políticas RLS del panel la evalúan en cada
-- consulta, así que quien ha iniciado sesión necesita poder ejecutarla. No
-- revela nada: responde sí o no sobre quien pregunta.
grant execute on function es_administrador() to authenticated;

-- Las funciones de trigger no se llaman: las invoca el propio trigger con los
-- permisos de la tabla. No necesitan concesión a nadie.

-- Y que las nuevas no nazcan abiertas.
alter default privileges in schema public revoke execute on functions from public;

comment on function correos_pendientes() is
  'Solo service_role. Su salida incluye nombres de estudiantes y contacto del acudiente: no puede quedar al alcance de la clave publicable. Ver 14-permisos-funciones.sql.';

-- -----------------------------------------------------------------------------
-- Y la tabla que se quedó fuera
-- -----------------------------------------------------------------------------
-- `correos_enviados` nació en 09-correos.sql, después de que 02-rls.sql cerrara
-- las demás, así que conservó los permisos por omisión: anon tenía arwdDxtm
-- —leer, insertar, actualizar y borrar—. Hoy no pasa nada porque la RLS está
-- activada y no hay ninguna política que le abra, pero es la única de las seis
-- tablas con una sola cerradura en vez de dos. Una política mal escrita mañana
-- sería la diferencia entre un fallo y una fuga.

revoke all on correos_enviados from anon, authenticated;
