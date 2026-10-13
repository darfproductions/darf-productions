#!/usr/bin/env bash
# Regenera supabase/dev/bootstrap_dev_0009_0028.sql a partir de supabase/migrations/.
# Solo para el proyecto Supabase "DARF 2.0 DEV" (ver docs/DARF-2.0-FASE-0.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
out=supabase/dev/bootstrap_dev_0009_0028.sql
head -n 29 "$out" > "$out.tmp"   # cabecera + guardia DEV + begin;
strip() { sed -E '/^\s*(begin|commit)\s*;\s*$/d' "$1"; }
{
  for f in supabase/migrations/00{09..17}_*.sql; do echo; echo "-- ──────── $(basename "$f") ────────"; strip "$f"; done
  cat <<'EOF'

-- ──────── SEED DEV: producciones de PRUEBA (mismos id que usa el código) ────────
insert into productions (id, nombre, venue, price, on_sale, concluded) values
  ('showman', 'Showman (PRUEBA)', 'Teatro de prueba', 250, false, false),
  ('mm',      'Mamma Mia! (PRUEBA)', 'Teatro de prueba', 150, false, true),
  ('hsm',     'High School Musical (PRUEBA)', 'Teatro de prueba', 50, false, true);
EOF
  for f in supabase/migrations/00{18..28}_*.sql; do echo; echo "-- ──────── $(basename "$f") ────────"; strip "$f"; done
  echo; echo "-- ──────── Registro de migraciones (trazabilidad en DEV) ────────"
  echo "insert into supabase_migrations.schema_migrations (version, name) values"
  list=(supabase/migrations/00{09..28}_*.sql); n=${#list[@]}; i=0
  for f in "${list[@]}"; do i=$((i+1)); sep=","; [ $i -eq $n ] && sep=";"; echo "  ('20261010$(printf '%06d' $i)', '$(basename "$f" .sql)')$sep"; done
  echo; echo "commit;"
  echo "select 'OK: migraciones 0009–0028 aplicadas en DARF 2.0 DEV' as resultado;"
} >> "$out.tmp"
mv "$out.tmp" "$out"
