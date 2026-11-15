-- Solo lectura: dice qué scripts de 0141 a 0146 ya se corrieron en esta base. No cambia nada.
select '0141 fase 5 (portal, ficha, preguntas)' as script, to_regclass('public.production_faq') is not null as corrido
union all select '0142 pasar boletos', to_regclass('public.ticket_transfers') is not null
union all select '0143 ícono de la obra', exists (select 1 from information_schema.columns where table_name = 'productions' and column_name = 'icono_path')
union all select '0144 Casa DARF: cargo y orden', to_regclass('public.casa_cargos') is not null
union all select '0145 Casa DARF: cabezas y descripción', exists (select 1 from information_schema.columns where table_name = 'casa_cargos' and column_name = 'directivo')
union all select '0146 solicitudes completas', exists (select 1 from pg_proc where proname = 'audition_fields_obligatoria');
