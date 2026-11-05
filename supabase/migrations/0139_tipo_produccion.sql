-- 0139 (Diego 2026-11-05, fase 4 del panel): tipo de producción.
--   * productions.tipo: 'profesional' (Showman), 'showcase', 'taller' o 'escuela' (Teen Beach Movie). Enciende y apaga
--     pestañas y textos del panel de la obra; no borra ni mueve ningún dato. Lo que no aplica queda en "Más".
--   * productions.con_boleteria: si la obra vende boletos por DARF. Se prende o apaga por obra (en una escuela a veces
--     vende DARF y a veces la escuela reparte). Con el tipo escuela, la web lo propone apagado.
--   * Las obras que ya existen quedan como 'profesional' con boletería: nada cambia para Showman.
-- Precede: 0136.

begin;

alter table productions
  add column tipo text not null default 'profesional',
  add column con_boleteria boolean not null default true;
alter table productions
  add constraint productions_tipo_valido check (tipo in ('profesional', 'showcase', 'taller', 'escuela'));

comment on column productions.tipo is 'Tipo de producción (0139): profesional, showcase, taller o escuela. Solo cambia qué se ve en el panel.';
comment on column productions.con_boleteria is 'Vende boletos por DARF (0139). Apagado: el panel esconde Boletos y no pide "Listo para vender".';

commit;
