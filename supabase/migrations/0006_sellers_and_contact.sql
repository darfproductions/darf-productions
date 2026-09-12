-- 0006: sellers + contact_messages
-- Mirrors DB.sellers and DB.contact today. No venue/seat dependency.

create table if not exists sellers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null,
  telefono text,
  asunto text,
  mensaje text not null,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_leido on contact_messages(leido);
