-- =============================================================================
-- FLI FBC · la foto y la dirección dejan de ser obligatorias
--
-- Se ejecuta después de 09-correos.sql.
--
-- No es una comodidad: para las empresas que vienen del Directorio Profesional
-- ese dato NO EXISTE. Aquel formulario nunca preguntó la dirección, y los logos
-- que subieron viven en URL de JotForm que no se pueden descargar sin sesión.
--
-- Exigirlas dejaba dos salidas, las dos malas: inventarse una dirección, o no
-- publicar a doce familias que dieron su consentimiento explícito. La tarjeta
-- dibuja un respaldo cuando no hay foto, y la ficha omite la fila cuando no hay
-- dirección, igual que ya hace con la web y el Instagram.
-- =============================================================================

alter table solicitudes_negocios alter column direccion drop not null;

comment on column solicitudes_negocios.direccion is
  'Opcional: el formulario del Directorio no la pedía. Muchas fichas no la tienen.';
