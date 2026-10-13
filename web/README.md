# DARF 2.0 — web

App de DARF 2.0 (Next.js + TypeScript + Supabase). Se construye por fases en la
rama `darf-2.0`; la web 1.0 publicada sigue en `main` (raíz del repo).
Contexto: `docs/DARF-2.0-VISION.md`, `docs/DARF-2.0-ARQUITECTURA.md`.

## Trabajar en local

```bash
cd web
cp .env.example .env.local   # solo valores de Supabase DEV
npm install
npm run dev                  # http://localhost:3000
```

## Verificaciones (también corren en GitHub Actions)

```bash
npx next typegen && npx tsc --noEmit   # tipos
npm run lint                           # revisión de código
npm run build                          # construcción
../scripts/check-isolation.sh          # solo Supabase DEV
```

## Reglas

- Solo variables públicas en `NEXT_PUBLIC_*`; nunca la service_role key.
- La boletería se hace llamando a las funciones existentes de la base
  (`create_seated_ticket_order`, `approve_order`, `check_in_ticket`…); no se
  reimplementan reglas de precio, inventario o permisos en la web.
- Tokens de diseño en `src/app/globals.css`; temas por producción en
  `src/lib/productions.ts` (pasan a la base en la Fase 2).
