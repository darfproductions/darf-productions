-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0154: Entregar un beneficio con el escáner de la puerta (acceso, experiencias y souvenirs).
-- Correr DESPUÉS de apply_0153_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'zona_beneficios' and column_name = 'por_compra') then
    raise exception 'ABORTADO: faltan los beneficios uno por compra (0130).';
  end if;
end $$;
-- 0154 · Entregar un beneficio con el escáner de la puerta (Diego 2026-11-20).
--   En Puerta se elige un beneficio, se da "Iniciar entrega" y se escanean boletos. Según el tipo:
--   * Acceso (entrar antes): dice sí o no, lo registra y cuenta también como su entrada.
--   * Experiencia, atención u otro (meet & greet, foto…): se registra al escanear. Uno por boleto: cada boleto una
--     vez. Uno por compra: sirve cualquier boleto de la orden, pero solo una vez por orden (otro boleto de la misma
--     orden se rechaza).
--   * Souvenir (póster, programa…): al escanear dice cuántos le tocan a la orden, cuántos ya se le dieron y cuántos
--     faltan; se entrega con un botón (uno o todos los que faltan).
-- Precede: 0130. No borra datos.


create or replace function beneficio_escaneo(p_performance uuid, p_beneficio uuid, p_token text, p_entregar int default 0) returns json
language plpgsql security definer set search_path = public as $$
declare
  b zona_beneficios; v_token uuid; t record; x record; modo text; objetivo uuid; objetivo_lugar text;
  total int; hechos int; ent timestamptz; entrada json; r record; n int := 0;
begin
  select * into b from zona_beneficios where id = p_beneficio;
  if not found then raise exception 'No se encontró el beneficio.'; end if;
  if not (is_staff() or has_perm(b.production_id, 'puerta.validar')) then raise exception 'No autorizado'; end if;
  modo := case b.tipo when 'souvenir' then 'fisico' when 'acceso' then 'acceso' else 'experiencia' end;

  begin v_token := btrim(p_token)::uuid;
  exception when others then return json_build_object('resultado', 'no_encontrado', 'modo', modo); end;

  select tk.id, tk.order_id, tk.is_active, tk.performance_id, pf.production_id, o.status, o.buyer_nombre, o.order_code,
         coalesce(s.seat_label, 'General · ' || pc.nombre) as lugar, pc.nombre as zona
    into t
    from tickets tk join orders o on o.id = tk.order_id join performances pf on pf.id = tk.performance_id
    left join seats s on s.id = tk.seat_id
    left join price_categories pc on pc.id = coalesce(s.price_category_id, tk.price_category_id)
   where tk.qr_token = v_token;
  if not found then return json_build_object('resultado', 'no_encontrado', 'modo', modo); end if;
  if t.production_id <> b.production_id then return json_build_object('resultado', 'otra_obra', 'modo', modo); end if;

  -- Datos de la persona para todas las respuestas.
  if t.performance_id <> p_performance then
    return json_build_object('resultado', 'otra_funcion', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar);
  end if;
  if not t.is_active then return json_build_object('resultado', 'cancelado', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar); end if;
  if t.status <> 'aprobado' then return json_build_object('resultado', 'por_pagar', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar); end if;

  select * into x from beneficios_de_ticket(t.id) y where y.beneficio_id = p_beneficio;
  if not found then
    return json_build_object('resultado', 'no_incluye', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar, 'zona', t.zona);
  end if;
  if x.estado = 'sin_cupo' then
    return json_build_object('resultado', 'sin_cupo', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar, 'cupo', x.cupo);
  end if;

  if modo <> 'fisico' then
    -- Uno por compra: se registra en el boleto de la orden que lo lleva, escaneen el que escaneen.
    objetivo := t.id;
    if x.estado = 'otro_boleto' then
      select tt.id, coalesce(s2.seat_label, 'General · ' || pc2.nombre) into objetivo, objetivo_lugar
        from tickets tt cross join lateral beneficios_de_ticket(tt.id) y
        left join seats s2 on s2.id = tt.seat_id left join price_categories pc2 on pc2.id = coalesce(s2.price_category_id, tt.price_category_id)
       where tt.order_id = t.order_id and tt.is_active and y.beneficio_id = p_beneficio and y.alcanza
       order by tt.created_at, tt.id limit 1;
      if objetivo is null then
        return json_build_object('resultado', 'no_incluye', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar, 'zona', t.zona);
      end if;
    end if;
    select e.entregado_at into ent from beneficio_entregas e where e.ticket_id = objetivo and e.beneficio_id = p_beneficio;
    if modo = 'acceso' then entrada := check_in_ticket(p_token, p_performance); end if;
    if ent is not null then
      return json_build_object('resultado', 'ya', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar, 'entregado_at', ent,
                               'por_compra', x.por_compra, 'con_boleto', case when objetivo <> t.id then objetivo_lugar end,
                               'entrada', entrada->>'result');
    end if;
    -- En uno por compra, si se escaneó otro boleto de la orden, queda anotado con cuál.
    perform beneficio_marcar(objetivo, t.production_id, p_beneficio, true,
                             case when objetivo <> t.id then 'Con el boleto ' || t.lugar end);
    return json_build_object('resultado', 'ok', 'modo', modo, 'nombre', t.buyer_nombre, 'lugar', t.lugar,
                             'por_compra', x.por_compra, 'estado', x.estado, 'entrada', entrada->>'result');
  end if;

  -- Físico: lo que le toca a toda la orden (uno por boleto con el beneficio, o uno por compra).
  if coalesce(p_entregar, 0) > 0 then
    for r in
      select tt.id from tickets tt cross join lateral beneficios_de_ticket(tt.id) y
       where tt.order_id = t.order_id and tt.is_active and y.beneficio_id = p_beneficio and y.alcanza and y.entregado_at is null
       order by (tt.id = t.id) desc, tt.created_at, tt.id
       limit least(p_entregar, 500)
    loop
      perform beneficio_marcar(r.id, t.production_id, p_beneficio, true, null);
      n := n + 1;
    end loop;
  end if;
  select count(*), count(y.entregado_at), max(y.entregado_at) into total, hechos, ent
    from tickets tt cross join lateral beneficios_de_ticket(tt.id) y
   where tt.order_id = t.order_id and tt.is_active and y.beneficio_id = p_beneficio and y.alcanza;
  return json_build_object('resultado', case when hechos >= total then 'completo' else 'debe' end, 'modo', modo,
                           'nombre', t.buyer_nombre, 'lugar', t.lugar, 'orden', t.order_code, 'por_compra', x.por_compra,
                           'total', total, 'entregados', hechos, 'entregados_ahora', n, 'entregado_at', ent, 'estado', x.estado);
end $$;
revoke all on function beneficio_escaneo(uuid, uuid, text, int) from public, anon;
grant execute on function beneficio_escaneo(uuid, uuid, text, int) to authenticated;

select 'Listo: 0154 aplicada (entregar beneficios con el escáner).' as resultado;
