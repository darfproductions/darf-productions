-- 0121 (Diego 2026-10-22): DARF Showcase Shows.
--   Página pública /showcases (se llega desde Eventos) con los planes, lo que incluye cada uno, precios, fotos y
--   videos de muestra; botón "Contratar" por plan con formulario: la solicitud se guarda en el panel y abre
--   WhatsApp con la información. En el panel, Proyectos → Showcases: planes, textos de la página, fotos/videos
--   (generales y de cada plan), número de WhatsApp y bandeja de solicitudes. Permiso de Casa DARF: casa.showcases.

insert into permissions (id, grupo, descripcion, orden) values
  ('casa.showcases', 'Casa DARF', 'Showcases: planes, página, fotos y videos y solicitudes', 111)
on conflict (id) do nothing;

-- ──────── Página (una sola fila) ────────
create table if not exists showcase_ajustes (
  id int primary key default 1 check (id = 1),
  publicado boolean not null default true,
  titulo text not null default 'DARF Showcase Shows',
  lema text default 'Música · Danza · Acrobacia · Espectáculo',
  intro text,
  importante text,
  publicos jsonb not null default '[]'::jsonb,      -- [{titulo, texto}]
  especial jsonb not null default '[]'::jsonb,      -- [{titulo, texto}]
  antes_reservar text[] not null default '{}',
  anticipacion text[] not null default '{}',
  condiciones jsonb not null default '[]'::jsonb,   -- [{titulo, texto}]
  whatsapp text,                                     -- solo dígitos con 52
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists showcase_planes (
  id uuid primary key default gen_random_uuid(),
  orden int not null default 0,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  descripcion text,
  precio numeric(10, 2) check (precio is null or precio >= 0),
  resumen text,            -- "35 minutos · 5–6 artistas"
  detalle text,            -- línea bajo el precio
  incluye text[] not null default '{}',
  ideal_para text,
  nota text,               -- consideración técnica
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fotos (Storage 'showcases') y videos (ligas de YouTube/Instagram/TikTok). plan_id null = generales.
create table if not exists showcase_media (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references showcase_planes(id) on delete cascade,
  categoria text not null default 'show' check (categoria in ('show', 'equipo', 'ensayos')),
  tipo text not null check (tipo in ('foto', 'video')),
  path text,
  url text,
  titulo text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  check ((tipo = 'foto' and path is not null) or (tipo = 'video' and url ~* '^https://'))
);
create index if not exists showcase_media_plan_idx on showcase_media(plan_id);

create table if not exists showcase_solicitudes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references showcase_planes(id) on delete set null,
  plan_nombre text not null,
  nombre text not null,
  telefono text not null,
  correo text,
  fecha date,
  horario text,
  lugar text,
  tipo_evento text,
  personas int check (personas is null or personas between 1 and 100000),
  notas text,
  estado text not null default 'nueva' check (estado in ('nueva', 'cotizada', 'confirmada', 'descartada')),
  notas_internas text,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists showcase_solicitudes_estado_idx on showcase_solicitudes(estado, created_at desc);

alter table showcase_ajustes enable row level security;
alter table showcase_planes enable row level security;
alter table showcase_media enable row level security;
alter table showcase_solicitudes enable row level security;

drop policy if exists showcase_ajustes_read on showcase_ajustes;
create policy showcase_ajustes_read on showcase_ajustes for select using (true);
drop policy if exists showcase_ajustes_write on showcase_ajustes;
create policy showcase_ajustes_write on showcase_ajustes for all to authenticated using (has_casa('casa.showcases')) with check (has_casa('casa.showcases'));

drop policy if exists showcase_planes_read on showcase_planes;
create policy showcase_planes_read on showcase_planes for select using (activo or has_casa('casa.showcases'));
drop policy if exists showcase_planes_write on showcase_planes;
create policy showcase_planes_write on showcase_planes for all to authenticated using (has_casa('casa.showcases')) with check (has_casa('casa.showcases'));

drop policy if exists showcase_media_read on showcase_media;
create policy showcase_media_read on showcase_media for select using (true);
drop policy if exists showcase_media_write on showcase_media;
create policy showcase_media_write on showcase_media for all to authenticated using (has_casa('casa.showcases')) with check (has_casa('casa.showcases'));

drop policy if exists showcase_solicitudes_staff on showcase_solicitudes;
create policy showcase_solicitudes_staff on showcase_solicitudes for select to authenticated using (has_casa('casa.showcases'));
drop policy if exists showcase_solicitudes_update on showcase_solicitudes;
create policy showcase_solicitudes_update on showcase_solicitudes for update to authenticated using (has_casa('casa.showcases')) with check (has_casa('casa.showcases'));

-- Solicitud desde la página (cualquiera, con o sin cuenta). Tope: 5 por teléfono al día.
create or replace function showcase_solicitar(p_plan uuid, p_nombre text, p_telefono text, p_correo text, p_fecha date,
  p_horario text, p_lugar text, p_tipo text, p_personas int, p_notas text) returns json
language plpgsql security definer set search_path = public as $$
declare pl showcase_planes; v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'); v_id uuid; v_wa text;
begin
  select * into pl from showcase_planes where id = p_plan and activo;
  if not found then raise exception 'Ese plan ya no está disponible.'; end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'Escribe tu nombre.'; end if;
  if char_length(v_tel) < 10 or char_length(v_tel) > 13 then raise exception 'Revisa tu teléfono: 10 dígitos.'; end if;
  if p_fecha is not null and p_fecha < (now() at time zone 'America/Mexico_City')::date then raise exception 'La fecha ya pasó.'; end if;
  if (select count(*) from showcase_solicitudes where regexp_replace(telefono, '\D', '', 'g') = v_tel and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya recibimos tus solicitudes de hoy; te contactamos por WhatsApp.';
  end if;
  insert into showcase_solicitudes (plan_id, plan_nombre, nombre, telefono, correo, fecha, horario, lugar, tipo_evento, personas, notas)
  values (pl.id, pl.nombre, left(btrim(p_nombre), 120), left(btrim(p_telefono), 30), nullif(left(btrim(coalesce(p_correo, '')), 200), ''),
          p_fecha, nullif(left(btrim(coalesce(p_horario, '')), 60), ''), nullif(left(btrim(coalesce(p_lugar, '')), 200), ''),
          nullif(left(btrim(coalesce(p_tipo, '')), 60), ''), p_personas, nullif(left(btrim(coalesce(p_notas, '')), 1500), ''))
  returning id into v_id;
  begin
    perform notify((select coalesce(array_agg(p.id), '{}') from profiles p
                     where casa_tiene(p.id, 'casa.showcases')
                       and not exists (select 1 from notifications x where x.user_id = p.id and x.tipo = 'showcase'
                                         and x.read_at is null and x.created_at > now() - interval '1 hour')),
      'showcase', 'Nueva solicitud de showcase', concat_ws(' · ', pl.nombre, btrim(p_nombre)), '/panel/showcases/solicitudes', null);
  exception when others then null;
  end;
  select whatsapp into v_wa from showcase_ajustes where id = 1;
  return json_build_object('id', v_id, 'whatsapp', v_wa);
end $$;
grant execute on function showcase_solicitar(uuid, text, text, text, date, text, text, text, int, text) to anon, authenticated;

-- ──────── Storage: bucket 'showcases' (fotos) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('showcases', 'showcases', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists showcases_insert on storage.objects;
create policy showcases_insert on storage.objects for insert to authenticated with check (bucket_id = 'showcases' and has_casa('casa.showcases'));
drop policy if exists showcases_update on storage.objects;
create policy showcases_update on storage.objects for update to authenticated using (bucket_id = 'showcases' and has_casa('casa.showcases')) with check (bucket_id = 'showcases' and has_casa('casa.showcases'));
drop policy if exists showcases_delete on storage.objects;
create policy showcases_delete on storage.objects for delete to authenticated using (bucket_id = 'showcases' and has_casa('casa.showcases'));

-- ──────── Contenido inicial (del dossier comercial 2026), solo si está vacío ────────
insert into showcase_ajustes (id, titulo, lema, intro, importante, publicos, especial, antes_reservar, anticipacion, condiciones, whatsapp)
values (1, 'DARF Showcase Shows', 'Música · Danza · Acrobacia · Espectáculo',
  'Una experiencia escénica inspirada en la energía del teatro musical, diseñada para llevar un momento de espectáculo a eventos escolares, corporativos y celebraciones. La producción actual de DARF lleva al escenario una selección de números de teatro musical, canciones y momentos participativos, con una puesta en escena pensada para conectar con el público.',
  'Los números de la producción actual de DARF se mantienen sin cambios. La personalización se concentra en los segmentos adicionales y debe acordarse con anticipación.',
  '[{"titulo":"Escuelas","texto":"Festivales, celebraciones, aniversarios y eventos especiales de comunidad escolar."},{"titulo":"Empresas","texto":"Eventos internos, celebraciones de equipo, convivios y fechas especiales."},{"titulo":"Celebraciones","texto":"Formatos escénicos para ocasiones que merecen algo distinto."}]'::jsonb,
  '[{"titulo":"Elenco en vivo","texto":"Artistas jóvenes con energía escénica y enfoque colaborativo."},{"titulo":"Identidad visual","texto":"Vestuario específico para showcases y elementos escénicos propios."},{"titulo":"Flexibilidad","texto":"Se pueden personalizar los segmentos complementarios según el evento."},{"titulo":"Participación","texto":"En los paquetes indicados, el público puede formar parte de un breve momento musical guiado."}]'::jsonb,
  array['Fecha, horario y ubicación del evento.', 'Tipo de celebración y público estimado.', 'Medidas del escenario o área de presentación.', 'Características del sistema de audio e iluminación.', 'Segmentos complementarios que desean personalizar.'],
  array['Show estándar: solicitar con mínimo 2 semanas de anticipación.', 'Show personalizado: mínimo 1 mes para diseño y ensayos.', 'Acceso al espacio 90 minutos antes para montaje, prueba técnica y ensayo.', 'Se recomienda visita o ensayo en sitio cuando sea viable.', 'El cliente facilita escenario/espacio y sistema principal de audio e iluminación.'],
  '[{"titulo":"Producción actual","texto":"Los números de la producción actual de DARF no se modifican. La personalización aplica a los segmentos adicionales acordados."},{"titulo":"Cambios y extras","texto":"Requerimientos extraordinarios de vestuario, utilería, ensayos o recursos técnicos deben evaluarse y cotizarse antes de confirmar."},{"titulo":"Participación infantil","texto":"Cualquier participación se acuerda con la persona organizadora, es voluntaria, adecuada a la edad y guiada por el elenco."},{"titulo":"Confirmación","texto":"La disponibilidad de fecha, forma de pago, anticipo, cancelaciones y vigencia de promociones se confirmarán por escrito con DARF antes de cerrar la contratación."}]'::jsonb,
  '524465220560')
on conflict (id) do nothing;

insert into showcase_planes (orden, nombre, descripcion, precio, resumen, detalle, incluye, ideal_para, nota)
select * from (values
  (1, 'Probadita', 'Una entrada breve al universo de producción DARF: formato compacto para eventos que buscan un toque de música y teatro.',
   3500::numeric, null::text, '2-4 voces + 1-2 bailarín/a o intérprete adicional, según la configuración artística y cotización específica.',
   array['1 número de nuestra producción actual.', '2–3 canciones adicionales para la ocasión (por ejemplo, Navidad, cumpleaños o canción escolar).', 'Vestuario específico para el showcase.', 'Utilería y elementos escénicos básicos de DARF.', 'Foto grupal con el elenco.', 'Flyer promocional de DARF.'],
   'Actos escolares, celebraciones pequeñas y eventos con espacio o tiempo de programación limitado.',
   'Audio e iluminación del recinto. DARF aporta micrófonos solo cuando se acuerde previamente para el paquete.'),
  (2, 'DARF Express', 'Más elenco, más movimiento y un momento participativo para acercar el espectáculo al público.',
   5900, '35 minutos · 5–6 artistas', 'Elenco con danza y posibilidad de sumar un momento de participación con una niña/niño invitado/a o integrante del equipo anfitrión.',
   array['2 números de nuestra producción actual.', '3–4 canciones o un medley temático (por ejemplo, Navidad, Michael Jackson o Shakira).', 'Vestuario de producción específico para showcases.', 'Utilería de DARF y hasta 2 micrófonos DARF, coordinados con el sistema de audio del recinto.', 'Foto con el elenco.', 'Flyer promocional de DARF.', 'Breve momento musical participativo, previamente acordado y guiado por el elenco.'],
   null, 'La referencia de hasta 150 asistentes depende de la compatibilidad y condiciones del equipo del recinto; debe validarse antes de confirmar.'),
  (3, 'Gran Carpa', 'El formato más completo: un espectáculo con conducción, variedad musical y mayor presencia escénica.',
   10900, '50 minutos · 8–10 artistas', 'Incluye presentador/a, danza y una experiencia con más cambios y oportunidades de interacción.',
   array['2–3 números de nuestra producción actual.', 'Medley personalizado de hasta 10 minutos, definido con al menos un mes de anticipación.', 'Canción participativa para cantar junto al público.', 'Vestuario específico para showcase y cambio de vestuario planificado.', 'Setlist definido previamente con el contratista con canciones y actos definidos.', 'Fotografías e interacción con el público; pueden realizarse fuera de los 50 minutos escénicos.', 'Flyer promocional de DARF.'],
   null, 'El recinto debe proporcionar el espacio escénico y su sistema de audio e iluminación principal. Los recursos adicionales se validan en la ficha técnica.')
) as v(orden, nombre, descripcion, precio, resumen, detalle, incluye, ideal_para, nota)
where not exists (select 1 from showcase_planes);
