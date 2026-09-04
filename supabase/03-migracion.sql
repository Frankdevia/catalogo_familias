-- =============================================================================
-- FLI FBC · migración de lo que ya está publicado
--
-- Se ejecuta después de 01-esquema.sql y 02-rls.sql, una sola vez.
--
-- Trae al panel las fichas y los anuncios que YA están vivos en el sitio, para
-- que desde el primer día se puedan editar y retirar desde ahí en vez de a mano.
-- Entran como `aprobado` con `publicado_en` puesto: así el cron los ve
-- publicados y no los vuelve a commitear.
--
-- LOS DATOS PRIVADOS NO SE PUEDEN RECUPERAR. El JSON publicado no contiene
-- —a propósito— los nombres de los estudiantes ni el contacto del acudiente:
-- esos se quedaron en el Google Sheet. Aquí van con un marcador explícito, no
-- con datos inventados que parezcan reales. Si alguna de estas fichas se edita
-- después, quien revise verá el marcador y sabrá que es anterior al panel.
--
-- El `grado` sale de descomponer "Familia — grado 7A", que es como se guardó.
--
-- NO INCLUYE las fichas de prueba («Test», «PRUEBA - borrar esta fila») ni el
-- anuncio de la bicicleta: se borraron del repo porque llevaban datos
-- personales reales publicados. Sus filas siguen en el Sheet marcadas como
-- publicadas, y ahí se quedan: el Sheet pasa a ser archivo histórico.
-- =============================================================================

insert into solicitudes_negocios (
  estado, publicado_en, notas_revision,
  estudiantes, acudiente_nombre, acudiente_telefono, acudiente_correo, consentimiento,
  nombre, categoria, descripcion, grado, telefono, direccion, web, instagram, facebook, orden,
  slug
) values
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Café de Origen Cerritos', 'Gastronomía', 'Café especial cultivado en finca familiar. Venta por libra y suscripción mensual.', '1B', '320 987 6543', 'Vereda Cerritos, Km 7, Pereira', 'cafecerritos.co', '@cafe.cerritos', 'Café de Origen Cerritos', 5,
   'cafe-de-origen-cerritos'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Coaching Liderazgo', 'Servicios', 'Capacitación liderazgo y coaching para equipos de trabajo', '5B', '3218409113', 'Cr 4 Calle 22 #10-07', 'www.leadershipgrowth.com', '@nllezcanoseg', 'www.facebook.com', 100,
   'coaching-liderazgo'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'ContaPlus Asesores', 'Servicios', 'Contabilidad y declaración de renta para personas y pequeñas empresas.', '10B', '300 876 5432', 'Av Circunvalar # 5-67, Of 302, Pereira', 'contaplus.com.co', '@contaplus.asesores', 'ContaPlus Asesores', 3,
   'contaplus-asesores'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Estudio Fotografía Luz', 'Servicios', 'Fotografía de eventos, retratos familiares y fotoproducto para negocios.', '8A', '301 234 9876', 'Cra 7 # 19-20, Pereira', 'estudioluz.co', '@estudio.foto.luz', 'Estudio Fotografía Luz', 6,
   'estudio-fotografia-luz'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Fisio Activa', 'Salud y bienestar', 'Fisioterapia deportiva y rehabilitación a domicilio o en consultorio.', '5A', '312 345 6789', 'Cll 14 # 7-89, Consultorio 204, Pereira', 'fisioactiva.co', '@fisio.activa', 'Fisio Activa Pereira', 4,
   'fisio-activa'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Repostería La Abuela', 'Gastronomía', 'Tortas, postres y desayunos sorpresa por encargo. Domicilios en Pereira y Dosquebradas.', '3B', '310 456 7890', 'Cra 15 # 12-34, Pereira', 'reposterialaabuela.co', '@reposteria.laabuela', 'Repostería La Abuela', 1,
   'reposteria-la-abuela'),
  ('aprobado', now(), 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', '0000000', 'sin-correo@migracion.local', true,
   'Tejidos Andina', 'Moda', 'Ropa tejida a mano: ruanas, bufandas y accesorios en lana natural.', '7A', '315 234 5678', 'Cll 8 # 23-45, Dosquebradas', 'tejidosandina.co', '@tejidos.andina', 'Tejidos Andina', 2,
   'tejidos-andina');

insert into solicitudes_clasificados (
  estado, publicado_en, notas_revision,
  estudiantes, acudiente_nombre, consentimiento,
  cat, descripcion, telefono, correo,
  slug
) values
  ('aprobado', '2026-09-02'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'BUSCO', 'Busco apartamento en arriendo cerca al colegio, de dos o tres habitaciones, para entrar en enero. Familia de cuatro personas, sin mascotas.', '313 447 6620', 'ejemplo.siete@correo.com',
   'busco-arriendo-cerca-al-colegio'),
  ('aprobado', '2026-09-01'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'BUSCO', 'Busco cupo en una ruta compartida hacia Cerritos para mi hija de bachillerato, de lunes a viernes. Puedo aportar la parte que corresponda de la gasolina.', '316 803 1174', 'ejemplo.ocho@correo.com',
   'busco-cupo-en-ruta-cerritos'),
  ('aprobado', '2026-08-30'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'BUSCO', 'Busco quien dé refuerzo de lectura a un niño de segundo grado, dos tardes por semana en casa o en biblioteca. Preferible con experiencia en primaria.', '314 259 9038', 'ejemplo.nueve@correo.com',
   'busco-refuerzo-de-lectura'),
  ('aprobado', '2026-08-29'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'BUSCO', 'Busco trabajo de medio tiempo en contabilidad o administración. Diez años de experiencia, disponibilidad en la mañana. Envío hoja de vida por correo.', '317 610 4482', 'ejemplo.diez@correo.com',
   'busco-trabajo-medio-tiempo'),
  ('aprobado', '2026-08-27'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'COMPRO', 'Busco escritorio de estudio en buen estado, mínimo 1.20 m de ancho, para el cuarto de mi hija.', '310 555 8899', 'ejemplo.dos@correo.com',
   'compro-escritorio'),
  ('aprobado', '2026-08-22'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'COMPRO', 'Compro libros de séptimo grado de segunda mano, en especial los de ciencias e inglés.', '318 220 5567', 'ejemplo.seis@correo.com',
   'compro-libros-septimo'),
  ('aprobado', '2026-08-26'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'OFREZCO', 'Clases particulares de matemáticas para bachillerato. Presencial en Pereira o virtual.', '312 776 4410', 'ejemplo.tres@correo.com',
   'ofrezco-clases-matematicas'),
  ('aprobado', '2026-08-24'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'OFREZCO', 'Cupo en ruta compartida desde Cerritos al colegio, salida 6:20 a. m. Conductora conocida de la comunidad.', '300 441 7788', 'ejemplo.cinco@correo.com',
   'ofrezco-transporte-cerritos'),
  ('aprobado', '2026-08-28'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'VENDO', 'Bicicleta MTB rin 29, marco talla M, poco uso. Incluye casco y candado.', '311 222 3344', 'ejemplo.uno@correo.com',
   'vendo-bicicleta-mtb'),
  ('aprobado', '2026-08-25'::timestamptz, 'Migrado del catálogo anterior; los datos del acudiente se quedaron en el Google Sheet.',
   '(anterior al panel)', '(anterior al panel)', true,
   'VENDO', 'Uniformes del colegio talla 10, sudadera y diario, en muy buen estado. Se venden por separado.', '315 908 2233', 'ejemplo.cuatro@correo.com',
   'vendo-uniformes-talla-10');

-- Comprobación
--   select estado, count(*) from solicitudes_negocios group by estado;
--   select estado, count(*) from solicitudes_clasificados group by estado;
-- Deben salir 7 negocios y 10 clasificados, todos en 'aprobado'.
