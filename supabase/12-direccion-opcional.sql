-- =============================================================================
-- FLI FBC · la dirección deja de ser obligatoria
--
-- Se ejecuta después de 11-descripcion-larga.sql.
--
-- La columna ya admitía nulos desde 10-opcionales.sql; lo que la exigía era el
-- formulario y la Edge Function. Al abrirlos queda pendiente lo que dejaron los
-- que no tenían local: escribieron «na» o «no aplica» porque el campo no les
-- dejaba seguir, y eso es lo que hoy sale impreso en su ficha publicada.
--
-- No hay lista de placeholders «por si acaso»: solo se cambian los valores que
-- de verdad están en la tabla. Un negocio llamado a su dirección «Local NA»
-- no debería perderla por una regla escrita de más.
-- =============================================================================

update solicitudes_negocios
   set direccion = null
 where direccion is not null
   and lower(trim(direccion)) in ('na', 'n/a', 'no aplica', 'no aplica.', 'ninguna', '-', '.');

comment on column solicitudes_negocios.direccion is
  'Opcional. Vacía va como NULL, no como cadena vacía: la consulta de publicación pasa por jsonb_strip_nulls y así la ficha no dibuja la fila «Dirección».';
