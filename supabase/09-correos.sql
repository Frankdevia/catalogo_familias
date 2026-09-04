-- =============================================================================
-- FLI FBC · qué correos hay que mandar
--
-- Se ejecuta después de 08-limite-envios.sql.
--
-- POR QUÉ EL TEXTO DEL CORREO SE ARMA AQUÍ Y NO EN n8n
--
-- Porque n8n queda como un tubo: lee esto y manda. Si el asunto y el cuerpo se
-- escribieran con expresiones dentro de los nodos, la copia que lee una familia
-- viviría fuera del repositorio, sin historial y sin poder revisarse en un
-- diff. Aquí se versiona con todo lo demás.
--
-- Lo único que n8n aporta —y es la razón de que siga en el circuito— es el
-- OAuth de Gmail ya configurado: los avisos salen de la cuenta del colegio, con
-- su reputación de dominio, en vez de un remitente nuevo que acabaría en spam.
-- =============================================================================

-- Un registro por correo enviado, en vez de tres columnas por tabla.
-- Añadir un tipo de aviso mañana no obliga a tocar el esquema de nadie.
create table if not exists correos_enviados (
  id         bigserial primary key,
  cola       text not null,          -- 'negocios' | 'clasificados' | 'promociones'
  fila_id    uuid,                   -- nulo en el resumen al colegio
  tipo       text not null,          -- 'recibido' | 'publicado' | 'rechazado' | 'resumen'
  enviado_en timestamptz not null default now()
);

create unique index if not exists idx_correo_unico
  on correos_enviados (cola, fila_id, tipo)
  where fila_id is not null;

comment on index idx_correo_unico is
  'La red contra el correo duplicado: si el cron se solapa o se reintenta, el segundo insert falla en vez de escribirle dos veces a la misma familia.';

-- -----------------------------------------------------------------------------
-- Qué hay por mandar
-- -----------------------------------------------------------------------------

create or replace function correos_pendientes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with pendientes as (
  -- Acuse de recibo, en cuanto llega la solicitud.
  select 'negocios' as cola, n.id, 'recibido' as tipo, n.acudiente_correo as para,
         n.acudiente_nombre as quien, n.nombre as asunto_de, null::text as nota
    from solicitudes_negocios n
   where n.estado = 'pendiente'
  union all
  select 'clasificados', c.id, 'recibido', c.correo, c.acudiente_nombre, left(c.descripcion, 60), null
    from solicitudes_clasificados c
   where c.estado = 'pendiente'
  union all
  select 'promociones', p.id, 'recibido', p.acudiente_correo, p.acudiente_nombre, p.titulo, null
    from solicitudes_promociones p
   where p.estado = 'pendiente'

  -- Ya está publicado.
  union all
  select 'negocios', n.id, 'publicado', n.acudiente_correo, n.acudiente_nombre, n.nombre,
         'https://comunidad.liceoingles.edu.co/negocio/' || n.slug || '/'
    from solicitudes_negocios n
   where n.estado = 'aprobado' and n.publicado_en is not null and n.slug is not null
  union all
  select 'clasificados', c.id, 'publicado', c.correo, c.acudiente_nombre, left(c.descripcion, 60),
         'https://comunidad.liceoingles.edu.co/#clasificados'
    from solicitudes_clasificados c
   where c.estado = 'aprobado' and c.publicado_en is not null
  union all
  select 'promociones', p.id, 'publicado', p.acudiente_correo, p.acudiente_nombre, p.titulo,
         'https://comunidad.liceoingles.edu.co/#promociones'
    from solicitudes_promociones p
   where p.estado = 'aprobado' and p.publicado_en is not null

  -- No se publica, y se dice por qué si quien revisó dejó una nota.
  union all
  select 'negocios', n.id, 'rechazado', n.acudiente_correo, n.acudiente_nombre, n.nombre, n.notas_revision
    from solicitudes_negocios n where n.estado = 'rechazado'
  union all
  select 'clasificados', c.id, 'rechazado', c.correo, c.acudiente_nombre, left(c.descripcion, 60), c.notas_revision
    from solicitudes_clasificados c where c.estado = 'rechazado'
  union all
  select 'promociones', p.id, 'rechazado', p.acudiente_correo, p.acudiente_nombre, p.titulo, p.notas_revision
    from solicitudes_promociones p where p.estado = 'rechazado'
)
select coalesce(jsonb_agg(jsonb_build_object(
  'cola', cola,
  'id', id,
  'tipo', tipo,
  'para', para,
  'asunto', case tipo
    when 'recibido'  then 'Recibimos tu solicitud'
    when 'publicado' then 'Ya está publicado en la comunidad FLI'
    else 'Sobre tu solicitud al catálogo FLI'
  end,
  'cuerpo', case tipo
    when 'recibido' then
      '<p>Hola ' || quien || ',</p>' ||
      '<p>Recibimos <b>' || asunto_de || '</b> para publicarlo en la comunidad de familias del Liceo Inglés.</p>' ||
      '<p>Lo revisaremos y te escribiremos a este mismo correo cuando esté publicado.</p>' ||
      '<p>Gracias por hacer parte de la comunidad.<br>Fundación Liceo Inglés</p>'
    when 'publicado' then
      '<p>Hola ' || quien || ',</p>' ||
      '<p><b>' || asunto_de || '</b> ya aparece en la comunidad de familias del Liceo Inglés.</p>' ||
      '<p>Puedes verlo y compartirlo desde aquí:<br><a href="' || nota || '">' || nota || '</a></p>' ||
      '<p>Gracias por hacer parte de la comunidad.<br>Fundación Liceo Inglés</p>'
    else
      '<p>Hola ' || quien || ',</p>' ||
      '<p>Revisamos <b>' || asunto_de || '</b> y por ahora no lo publicamos.</p>' ||
      coalesce('<p><b>Motivo:</b> ' || nullif(trim(nota), '') || '</p>', '') ||
      '<p>Si crees que fue un error o quieres corregir algo, escríbenos a ' ||
      '<a href="mailto:tecnologia@liceoingles.edu.co">tecnologia@liceoingles.edu.co</a>.</p>' ||
      '<p>Fundación Liceo Inglés</p>'
  end
) order by tipo), '[]'::jsonb)
  from pendientes p
 where para is not null
   and para <> ''
   -- El marcador de las filas migradas: no tienen correo real de nadie.
   and para <> 'sin-correo@migracion.local'
   and not exists (
     select 1 from correos_enviados e
      where e.cola = p.cola and e.fila_id = p.id and e.tipo = p.tipo
   );
$$;

-- -----------------------------------------------------------------------------
-- Dejar constancia
-- -----------------------------------------------------------------------------
-- Se llama DESPUÉS de que Gmail haya aceptado el envío, uno a uno. Si el cron
-- muere a mitad, lo ya enviado queda marcado y lo demás se reintenta: es
-- preferible a marcar todo por adelantado y dejar familias sin aviso.

create or replace function marcar_correo(p_cola text, p_id uuid, p_tipo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into correos_enviados (cola, fila_id, tipo)
  values (p_cola, p_id, p_tipo)
  on conflict do nothing;
$$;

revoke execute on function correos_pendientes() from anon, authenticated;
revoke execute on function marcar_correo(text, uuid, text) from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Las solicitudes migradas no reciben correo
-- -----------------------------------------------------------------------------
-- Se marcan como ya avisadas todas las que existían antes de este circuito. Sin
-- esto, la primera pasada del cron escribiría a diecisiete familias para
-- decirles que algo que llevan semanas viendo publicado «ya está publicado».

insert into correos_enviados (cola, fila_id, tipo)
select 'negocios', id, t.tipo from solicitudes_negocios, (values ('recibido'),('publicado'),('rechazado')) as t(tipo)
on conflict do nothing;

insert into correos_enviados (cola, fila_id, tipo)
select 'clasificados', id, t.tipo from solicitudes_clasificados, (values ('recibido'),('publicado'),('rechazado')) as t(tipo)
on conflict do nothing;
