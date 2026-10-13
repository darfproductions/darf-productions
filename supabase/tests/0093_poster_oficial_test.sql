-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0093 aplicadas.

-- T1: el póster es opcional y se guarda en la carpeta del kit de su obra.
do $$ begin
  if exists (select 1 from productions where poster_3x4_path is not null) then raise exception 'FALLO T1: no debería haber pósters'; end if;
  update productions set poster_3x4_path = 'showman/kit/poster-3x4.jpg', poster_16x9_info_path = 'showman/kit/poster-16x9-info.jpg' where id = 'showman';
  if (select poster_3x4_path from productions where id = 'showman') <> 'showman/kit/poster-3x4.jpg' then raise exception 'FALLO T1: no se guardó'; end if;
  update productions set poster_3x4_path = null where id = 'showman';
end $$;

-- T2: no se acepta una ruta de otra obra ni fuera del kit.
do $$ begin
  begin
    update productions set poster_9x16_path = 'otra/kit/x.jpg' where id = 'showman';
    raise exception 'FALLO T2: aceptó ruta de otra obra';
  exception when check_violation then null;
  end;
  begin
    update productions set poster_4x3_info_path = 'showman/galeria/x.jpg' where id = 'showman';
    raise exception 'FALLO T2: aceptó ruta fuera del kit';
  exception when check_violation then null;
  end;
end $$;

select 'OK 0093';
