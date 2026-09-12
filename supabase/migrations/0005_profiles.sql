-- 0005: profiles
-- Thin profile on top of Supabase auth.users. `rol` lives here, server-side,
-- and is deliberately NOT writable by the owning user via RLS (see 0010) —
-- this is what closes the "edit localStorage to become staff" hole in the
-- current system.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  telefono text,
  rol user_role not null default 'fan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up, defaulting to 'fan'.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, nombre, rol)
  values (new.id, new.raw_user_meta_data->>'nombre', 'fan');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
