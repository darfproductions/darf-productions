-- 0035: en puerta solo entran boletos de órdenes aprobadas (Fase 4 adelantada,
-- aprobada por Johann 2026-10-11). Antes, check_in_ticket aceptaba también
-- boletos de órdenes pendientes. Ahora responde 'no_aprobado' y no los marca.
-- El resto de la función queda idéntico a 0034 (cuerpo copiado por script).

begin;

create or replace function check_in_ticket(target_qr_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_ticket record;
  v_updated integer;
begin
  -- Si el QR existe, hace falta puerta.validar en SU obra; si no existe, basta con
  -- ser puerta en alguna obra para recibir el mensaje normal de "QR inválido".
  if not (
    is_staff()
    or exists (
      select 1 from tickets t join performances pf on pf.id = t.performance_id
       where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))) and has_perm(pf.production_id, 'puerta.validar'))
    or (not exists (select 1 from tickets t where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))))
        and exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                     where m.user_id = auth.uid() and rp.permission_id = 'puerta.validar'))
  ) then raise exception 'No autorizado'; end if;

  begin
    v_token := btrim(target_qr_token)::uuid;
  exception when others then
    return json_build_object('result', 'no_encontrado');
  end;

  select t.id, t.is_active, t.checked_in_at, s.seat_label, pc.nombre as category,
         pf.starts_at, o.buyer_nombre, o.status as order_status
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = s.price_category_id
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  -- 0035: solo entran boletos de órdenes APROBADAS (una pendiente aún no está pagada).
  if v_ticket.order_status <> 'aprobado' then
    return json_build_object('result', 'no_aprobado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  update tickets set checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_ticket.id and is_active and checked_in_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('result', 'ya_usado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre,
                             'checked_in_at', v_ticket.checked_in_at);
  end if;

  return json_build_object('result', 'ok', 'seat_label', v_ticket.seat_label,
                           'category', v_ticket.category,
                           'performance_starts_at', v_ticket.starts_at,
                           'buyer_nombre', v_ticket.buyer_nombre);
end;
$$;

commit;
