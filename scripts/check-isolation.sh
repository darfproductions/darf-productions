#!/usr/bin/env bash
# Verifica que la rama darf-2.0 solo apunta al proyecto Supabase DEV.
# Falla (exit 1) si encuentra cualquier otra URL *.supabase.co o una clave
# JWT de Supabase emitida para otro proyecto. No contiene la referencia de
# producción a propósito: se comprueba por lista blanca, no por lista negra.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV_REF="qgywscczyzuqinutuvak"
fail=0

refs=$(git ls-files -z | xargs -0 grep -ohIE '[a-z0-9]{20}\.supabase\.co' 2>/dev/null | sort -u || true)
for r in $refs; do
  if [ "${r%%.*}" != "$DEV_REF" ]; then echo "✗ Proyecto Supabase NO permitido (ref ${r:0:4}…)"; fail=1; fi
done

for jwt in $(git ls-files -z | xargs -0 grep -ohIE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' 2>/dev/null | sort -u || true); do
  payload=$(echo "$jwt" | cut -d. -f2 | tr '_-' '/+'); while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="$payload="; done
  ref=$(echo "$payload" | base64 -d 2>/dev/null | grep -oE '"ref":"[a-z0-9]+"' | cut -d'"' -f4 || true)
  if [ -n "$ref" ] && [ "$ref" != "$DEV_REF" ]; then echo "✗ Clave JWT de otro proyecto Supabase"; fail=1; fi
done

if ! grep -q "ENV: 'DEV'" js/config.js; then echo "✗ js/config.js no está marcado como DEV"; fail=1; fi

if [ $fail -eq 0 ]; then echo "✓ Aislamiento OK: solo se usa Supabase DEV ($DEV_REF)"; fi
exit $fail
