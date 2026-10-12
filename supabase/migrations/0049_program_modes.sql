-- 0049: el programa digital se puede armar de 3 formas (pedido de Diego, 2026-10-12).
--   * plantilla: la página de DARF que se llena sola con la obra (0048).
--   * enlace: un link externo (Canva, Drive, otra página); "Ver programa" y el QR llevan ahí.
--   * archivo: un PDF o imagen subido a producciones/<obra>/programa/ (máx. 20 MB).
--   El QR siempre apunta a /programa/<obra>, así no cambia aunque se cambie la forma.
-- Precede: 0048.

begin;

alter table program_pages
  add column modo text not null default 'plantilla' check (modo in ('plantilla', 'enlace', 'archivo')),
  add column enlace_url text check (enlace_url is null or (enlace_url ~* '^https://\S+$' and length(enlace_url) <= 500)),
  add column archivo_path text check (archivo_path is null or archivo_path like production_id || '/programa/%');

-- Si el modo pide enlace o archivo, debe existir antes de publicar.
alter table program_pages add constraint program_pages_modo_listo check (
  not publicado
  or modo = 'plantilla'
  or (modo = 'enlace' and enlace_url is not null)
  or (modo = 'archivo' and archivo_path is not null));

-- El bucket público de obras acepta también PDF (programas), hasta 20 MB.
-- Las reglas de cada tipo de imagen siguen en la web; quién escribe dónde sigue en can_write_object.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'producciones';

commit;
