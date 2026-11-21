-- 0161 · Honorarios: cómo quiere cobrar cada quien (Diego 2026-11-21).
--   * En Mi cuenta, Mis honorarios: cada persona elige transferencia o efectivo y pone su CLABE y titular (siempre,
--     aunque prefiera efectivo, necesitamos su información de cuenta). Las 4 cabezas la ven en Honorarios (El mes y los cierres), junto
--     al pago de cada persona, para depositar. Mientras falte, le sale un aviso como el del expediente (0160).
--   * Mis honorarios le sale a quien cobra: los creativos de cualquier obra y el elenco (reparto o ensamble) de obras
--     tipo profesional; y a quien ya tenga pagos o una bolsa asignada.
-- Precede: 0160. No borra datos.

begin;

-- CLABE: 18 dígitos y dígito verificador (pesos 3, 7, 1).
create or replace function clabe_valida(c text) returns boolean
language sql immutable as $$
  select c ~ '^[0-9]{18}$' and (
    (10 - (select sum(((substr(c, i, 1))::int * (array[3, 7, 1])[((i - 1) % 3) + 1]) % 10) from generate_series(1, 17) i) % 10) % 10
  ) = substr(c, 18, 1)::int
$$;

create table if not exists hon_datos_pago (
  person_id uuid primary key references people(id) on delete cascade,
  metodo text not null default 'transferencia' check (metodo in ('transferencia', 'efectivo')),
  titular text not null check (length(btrim(titular)) between 2 and 120),
  banco text check (banco is null or length(btrim(banco)) between 2 and 60),
  clabe text not null check (clabe_valida(clabe)),
  updated_at timestamptz not null default now()
);
-- Si ya existía (versión anterior de este script): CLABE y titular obligatorios.
alter table hon_datos_pago drop constraint if exists hon_datos_pago_check;
alter table hon_datos_pago alter column titular set not null, alter column clabe set not null;
alter table hon_datos_pago enable row level security;
revoke all on hon_datos_pago from anon;
drop policy if exists hon_datos_pago_cabezas on hon_datos_pago;
create policy hon_datos_pago_cabezas on hon_datos_pago for select to authenticated using (hon_cabeza());
drop policy if exists hon_datos_pago_propio on hon_datos_pago;
create policy hon_datos_pago_propio on hon_datos_pago for select to authenticated using (hon_es_mi_persona(person_id));

-- ¿Me toca Mis honorarios? Creativo en alguna obra, elenco de una obra profesional, o ya tengo pagos o bolsa.
create or replace function mis_honorarios_aplica() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from production_credits c join people pe on pe.id = c.person_id join productions p on p.id = c.production_id
             where pe.profile_id = auth.uid()
               and (c.tipo = 'creativo' or (c.tipo in ('reparto', 'ensamble') and coalesce(p.tipo, 'profesional') = 'profesional')))
    or exists (select 1 from hon_mes_personas x where hon_es_mi_persona(x.person_id))
    or exists (select 1 from hon_cierre_personas x where hon_es_mi_persona(x.person_id))
    or exists (select 1 from hon_asignaciones a where hon_es_mi_persona(a.person_id)))
$$;
revoke all on function mis_honorarios_aplica() from public, anon;
grant execute on function mis_honorarios_aplica() to authenticated;

-- ¿Me falta poner cómo quiero cobrar? null = no me toca Mis honorarios.
create or replace function mi_datos_pago_falta() returns boolean
language sql stable security definer set search_path = public as $$
  select case when mis_honorarios_aplica() then not exists (
    select 1 from hon_datos_pago d join people pe on pe.id = d.person_id where pe.profile_id = auth.uid()) end
$$;
revoke all on function mi_datos_pago_falta() from public, anon;
grant execute on function mi_datos_pago_falta() to authenticated;

-- Guardar cómo quiero cobrar (en todas mis fichas de persona).
create or replace function hon_mis_datos_pago_guardar(p_metodo text, p_titular text, p_banco text, p_clabe text) returns void
language plpgsql security definer set search_path = public as $$
declare v_clabe text := nullif(regexp_replace(coalesce(p_clabe, ''), '\s', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  if p_metodo not in ('transferencia', 'efectivo') then raise exception 'Elige transferencia o efectivo.'; end if;
  if v_clabe is not null and not clabe_valida(v_clabe) then raise exception 'La CLABE no es válida: revisa los 18 dígitos.'; end if;
  if v_clabe is null then raise exception 'Pon tu CLABE: aunque prefieras efectivo, necesitamos tu información de cuenta.'; end if;
  if coalesce(length(btrim(p_titular)), 0) < 2 then raise exception 'Pon el nombre del titular de la cuenta.'; end if;
  if not exists (select 1 from people where profile_id = auth.uid()) then
    raise exception 'Tu cuenta todavía no está ligada a tu ficha del equipo. Pídele a la producción que la ligue.';
  end if;
  insert into hon_datos_pago (person_id, metodo, titular, banco, clabe, updated_at)
  select id, p_metodo, nullif(btrim(p_titular), ''), nullif(btrim(p_banco), ''), v_clabe, now() from people where profile_id = auth.uid()
  on conflict (person_id) do update set metodo = excluded.metodo, titular = excluded.titular, banco = excluded.banco,
         clabe = excluded.clabe, updated_at = now();
end $$;
revoke all on function hon_mis_datos_pago_guardar(text, text, text, text) from public, anon;
grant execute on function hon_mis_datos_pago_guardar(text, text, text, text) to authenticated;

commit;
