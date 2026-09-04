-- =============================================================================
-- FLI FBC · esquema
--
-- Se ejecuta una sola vez, en el proyecto NUEVO de Supabase (no en SIS ni en
-- restaurantpos). Orden: 01-esquema.sql → 02-rls.sql → 03-migracion.sql
--
-- Idea que gobierna el diseño: las tres colas —negocios, clasificados,
-- promociones— comparten el mismo ciclo de vida y se diferencian solo en lo que
-- publican. Por eso el ciclo de vida está factorizado en un tipo y un trigger
-- comunes, y cada tabla añade lo suyo.
--
-- Las columnas se repiten en cada tabla en vez de heredarlas: la herencia de
-- tablas de Postgres no propaga claves foráneas ni índices únicos, y aquí eso
-- importa más que ahorrar tres líneas.
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Vocabulario
-- -----------------------------------------------------------------------------

-- Los MISMOS cuatro estados que hoy se escriben a mano en la columna `estado`
-- del Google Sheet y que leen los workflows de n8n. Se conservan tal cual para
-- que la migración sea un copiar y pegar y para que quien ya conoce el circuito
-- no tenga que reaprender nada.
create type estado_solicitud as enum (
  'pendiente',   -- recién llegada, nadie la ha mirado
  'aprobado',    -- el cron la publica, o la republica si se editó
  'rechazado',   -- no se publica; se conserva para tener histórico
  'retirado'     -- estuvo publicada y el cron la borró del repo
);

-- Espejo de src/data/categorias.ts. Son la misma lista en dos sitios que no
-- comparten código: si se añade una categoría, hay que añadirla en los dos.
create type categoria_negocio as enum (
  'Gastronomía', 'Moda', 'Servicios', 'Salud y bienestar',
  'Productos', 'Accesorios', 'Tecnología'
);

-- Espejo de src/data/clasificados.ts.
create type categoria_clasificado as enum ('COMPRO', 'BUSCO', 'VENDO', 'OFREZCO');

-- -----------------------------------------------------------------------------
-- Quién administra
-- -----------------------------------------------------------------------------

-- Estar autenticado NO basta: hay que estar aquí. Esta tabla es la que
-- consultan todas las políticas RLS, así que es el único sitio donde se
-- concede o se quita acceso al panel.
create table administradores (
  id         uuid primary key references auth.users(id) on delete cascade,
  correo     text not null unique,
  nombre     text,
  creado_en  timestamptz not null default now()
);

comment on table administradores is
  'Lista blanca del panel. Un usuario de auth.users que no esté aquí no lee ni escribe nada.';

-- `security definer` a propósito: sin él, una política sobre `administradores`
-- que llama a esta función, que a su vez lee `administradores`, se llama a sí
-- misma y Postgres corta por recursión infinita.
create or replace function es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from administradores where id = auth.uid());
$$;

-- Marca `actualizado_en` en cada UPDATE. De esta columna depende que editar una
-- ficha ya publicada la vuelva a publicar: el cron busca
-- `actualizado_en > publicado_en`.
create or replace function tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cola 1 · Catálogo de empresas
-- -----------------------------------------------------------------------------

create table solicitudes_negocios (
  id                 uuid primary key default gen_random_uuid(),

  -- --- ciclo de vida ------------------------------------------------------
  estado             estado_solicitud not null default 'pendiente',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  publicado_en       timestamptz,
  revisado_por       uuid references auth.users(id) on delete set null,
  revisado_en        timestamptz,
  notas_revision     text,

  -- Fase 2: cuando las familias entren con su cuenta, aquí queda quién envió.
  -- Nulo mientras los formularios sean anónimos; la columna existe desde ya
  -- para no tener que migrar filas después.
  autor_id           uuid references auth.users(id) on delete set null,

  -- --- identidad · NO se publica nunca ------------------------------------
  -- `estudiantes` son nombres de menores. Es el dato con el que el Consejo
  -- valida que quien escribe es del colegio, y no puede salir de esta tabla.
  estudiantes        text not null check (length(estudiantes) between 1 and 150),
  acudiente_nombre   text not null check (length(acudiente_nombre) between 1 and 80),
  acudiente_telefono text not null,
  acudiente_correo   text not null,
  consentimiento     boolean not null default false,

  -- --- lo que sí se publica -----------------------------------------------
  nombre             text not null check (length(nombre) between 1 and 60),
  categoria          categoria_negocio not null,
  descripcion        text not null check (length(descripcion) between 1 and 200),
  -- Lo escribe quien revisa, leyendo `estudiantes`. Llega vacío a propósito.
  -- La ficha lo muestra como "Familia — grado 7A".
  grado              text check (grado is null or length(grado) between 1 and 10),
  telefono           text not null check (telefono ~ '^[0-9 ]+$'),
  direccion          text not null check (length(direccion) between 1 and 120),
  web                text,
  instagram          text check (instagram is null or instagram like '@%'),
  facebook           text,
  orden              integer not null default 100,

  -- --- foto ---------------------------------------------------------------
  -- Ruta dentro del bucket privado. Se borra de Storage en cuanto la foto queda
  -- commiteada en el repo: 700 fotos de hasta 1,5 MB son ~1 GB, justo el
  -- límite del plan gratuito, y el repo es donde la foto vive de verdad.
  foto_ruta          text,
  foto_borrada_en    timestamptz,

  -- Nombre del archivo publicado: src/content/negocios/<slug>.json. Lo calcula
  -- el cron al publicar. Único, para que dos negocios homónimos no se pisen.
  slug               text unique,

  -- Hoy esto es un `throw` dentro de un Code node de n8n, y ahí llega tarde:
  -- la fila ya está aprobada y el fallo aparece diez minutos después, en una
  -- ejecución que nadie mira. Aquí no se puede aprobar sin grado, y punto.
  constraint grado_obligatorio_al_aprobar
    check (estado <> 'aprobado' or (grado is not null and length(trim(grado)) > 0))
);

create trigger t_negocios_actualizado
  before update on solicitudes_negocios
  for each row execute function tocar_actualizado_en();

-- El cron pregunta siempre lo mismo: qué está aprobado y pendiente de publicar
-- o de republicar.
create index idx_negocios_por_publicar
  on solicitudes_negocios (estado, publicado_en, actualizado_en);
create index idx_negocios_estado_creado
  on solicitudes_negocios (estado, creado_en desc);
create index idx_negocios_autor on solicitudes_negocios (autor_id);

-- -----------------------------------------------------------------------------
-- Cola 2 · Anuncios clasificados
-- -----------------------------------------------------------------------------
-- Diferencia de fondo con el catálogo: aquí el teléfono y el correo SÍ son
-- públicos, porque son el objeto del anuncio y la familia lo consiente
-- explícitamente. Lo que sigue sin salir es `estudiantes` y el nombre del
-- acudiente.

create table solicitudes_clasificados (
  id                 uuid primary key default gen_random_uuid(),

  estado             estado_solicitud not null default 'pendiente',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  publicado_en       timestamptz,
  revisado_por       uuid references auth.users(id) on delete set null,
  revisado_en        timestamptz,
  notas_revision     text,
  autor_id           uuid references auth.users(id) on delete set null,

  estudiantes        text not null check (length(estudiantes) between 1 and 150),
  acudiente_nombre   text not null check (length(acudiente_nombre) between 1 and 80),
  consentimiento     boolean not null default false,

  cat                categoria_clasificado not null,
  descripcion        text not null check (length(descripcion) between 1 and 280),
  telefono           text not null check (telefono ~ '^[0-9 ]+$'),
  correo             text not null,

  slug               text unique
);

create trigger t_clasificados_actualizado
  before update on solicitudes_clasificados
  for each row execute function tocar_actualizado_en();

create index idx_clasificados_por_publicar
  on solicitudes_clasificados (estado, publicado_en, actualizado_en);
create index idx_clasificados_estado_creado
  on solicitudes_clasificados (estado, creado_en desc);
create index idx_clasificados_autor on solicitudes_clasificados (autor_id);

-- -----------------------------------------------------------------------------
-- Cola 3 · Promociones
-- -----------------------------------------------------------------------------
-- Colección nueva. Lo que la distingue de las otras dos es la vigencia: una
-- promoción caduca y el cron la retira sola. Una sección de promociones sin
-- caducidad se pudre en un mes.

create table solicitudes_promociones (
  id                 uuid primary key default gen_random_uuid(),

  estado             estado_solicitud not null default 'pendiente',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  publicado_en       timestamptz,
  revisado_por       uuid references auth.users(id) on delete set null,
  revisado_en        timestamptz,
  notas_revision     text,
  autor_id           uuid references auth.users(id) on delete set null,

  estudiantes        text not null check (length(estudiantes) between 1 and 150),
  acudiente_nombre   text not null check (length(acudiente_nombre) between 1 and 80),
  acudiente_correo   text not null,
  consentimiento     boolean not null default false,

  -- Texto libre y no una clave foránea al catálogo: una familia puede ofrecer
  -- una promoción de un negocio que todavía no está publicado, y bloquearla por
  -- eso sería absurdo. Quien revisa lo cuadra a mano si hace falta.
  negocio            text not null check (length(negocio) between 1 and 60),
  titulo             text not null check (length(titulo) between 1 and 80),
  descripcion        text not null check (length(descripcion) between 1 and 280),
  condiciones        text check (condiciones is null or length(condiciones) <= 200),
  telefono           text not null check (telefono ~ '^[0-9 ]+$'),

  vigente_desde      date not null,
  vigente_hasta      date not null,

  slug               text unique,

  constraint vigencia_coherente check (vigente_hasta >= vigente_desde)
);

create trigger t_promociones_actualizado
  before update on solicitudes_promociones
  for each row execute function tocar_actualizado_en();

create index idx_promociones_por_publicar
  on solicitudes_promociones (estado, publicado_en, actualizado_en);
-- Para que el cron encuentre en un índice las que caducaron.
create index idx_promociones_vigencia
  on solicitudes_promociones (estado, vigente_hasta);
create index idx_promociones_autor on solicitudes_promociones (autor_id);

-- -----------------------------------------------------------------------------
-- Freno contra el abuso
-- -----------------------------------------------------------------------------
-- Los formularios son públicos y, desde que se quitó el código de familia, no
-- hay ninguna comprobación automática de que quien escribe sea del colegio. La
-- Edge Function consulta esta tabla antes de insertar. No pretende parar a un
-- atacante decidido; pretende que un script tonto no llene la cola en una tarde.

create table intentos_envio (
  id         bigserial primary key,
  huella     text not null,   -- hash de la IP, no la IP
  cola       text not null,   -- 'negocios' | 'clasificados' | 'promociones'
  creado_en  timestamptz not null default now()
);

create index idx_intentos_huella_tiempo on intentos_envio (huella, creado_en desc);

comment on column intentos_envio.huella is
  'Hash de la IP, no la IP. Sirve para contar, no para identificar a nadie.';
