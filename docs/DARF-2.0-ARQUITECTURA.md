# DARF 2.0 — Recomendación de arquitectura (Fase 1, propuesta)

Estado: **decidido — Next.js** (2026-10-10). Johann aprobó instalar dependencias
y crear `web/`; el esqueleto ya existe (ver §9). Contexto: `docs/DARF-2.0-VISION.md` §14 y
`docs/DARF-2.0-FASE-0.md`.

---

## 1. El problema

La web 1.0 es una sola página (`index.html`, ~1,270 líneas) con toda la lógica
en un solo archivo (`js/app.js`, ~2,200 líneas) y sin proceso de construcción.
Funcionó para lanzar la boletería, pero no escala a lo que pide la visión:

- **No hay plantillas ni rutas reales.** Cada producción es HTML escrito a mano
  y todas viven en la misma página (`?v=showman`). Una producción nueva no
  puede tener su página sin programarla, ni su propia dirección
  (`/producciones/showman`) con vista previa al compartir en redes.
- **No hay componentes.** Botones, tarjetas y formularios se repiten a mano
  (~500 estilos en línea); el sistema de diseño y los temas por producción
  serían muy difíciles de mantener.
- **El panel crecerá mucho** (editor de producción, permisos, audiciones,
  talento). En un archivo único, un cambio en una parte puede romper otra sin
  que se note.
- **No hay pruebas automáticas** del lado de la web ni optimización de imágenes.

## 2. Lo que juega a favor: la boletería vive en la base de datos

Las reglas críticas (precio calculado en servidor, anti-doble venta, apartado
de asientos, descuentos, aprobación, QR, check-in, permisos) están en
Postgres: tablas, RLS y funciones `SECURITY DEFINER` (`create_seated_ticket_order`,
`approve_order`, `check_in_ticket`, etc.). La web solo las **llama**.

Consecuencia: **cambiar la tecnología de la web no obliga a reescribir la
boletería.** La web nueva llama a las mismas funciones con los mismos datos.
Eso reduce mucho el riesgo de la migración, siempre que:

1. no se cambien las firmas de esas funciones sin una migración nueva y probada;
2. los `qr_token` ya emitidos sigan siendo válidos;
3. las pruebas SQL de boletería pasen antes de cada cambio (ya corren en una
   Postgres local, ver Fase 0 §3.2.1).

## 3. Opciones evaluadas

| Criterio | A. Seguir sin framework (ordenar en módulos) | B. Astro | C. SvelteKit | D. **Next.js** (React) |
|---|---|---|---|---|
| Rutas y plantillas por producción | Manual, limitado | Excelente | Excelente | Excelente |
| Panel administrativo grande e interactivo | Difícil | Necesita "islas" de otro framework (dos formas de trabajar) | Muy bueno | Muy bueno |
| Integración con Supabase (sesión en servidor) | Solo navegador | Buena | Buena (oficial) | Muy buena (oficial, la más documentada) |
| Integración con Vercel | Estática | Buena | Buena | Nativa (Vercel lo creó) |
| Optimización de imágenes | Manual | Integrada | Manual / librería | Integrada |
| Componentes accesibles listos para formularios y tablas | No | Pocos | Medianos | Muchos |
| Pruebas automáticas | Posibles | Buenas | Buenas | Buenas |
| Cantidad de documentación y ejemplos (clave para mantener con Claude) | — | Alta | Media | **La más alta** |
| Complejidad para aprender | Baja | Baja | Baja-media | Media |
| Riesgo de migración | Bajo, pero no resuelve el problema | Medio | Medio | Medio |

**Por qué no A:** ordenar el código sin framework mejora poco y deja sin
resolver plantillas, rutas, componentes e imágenes; habría que construir a
mano lo que un framework ya trae.
**Por qué no B:** Astro es ideal para sitios de contenido, pero el panel y la
compra son aplicaciones interactivas; terminaríamos con Astro + React (dos
modelos mentales).
**C (SvelteKit) es una alternativa sólida** y algo más sencilla de leer; queda
como segunda opción si se prefiere simplicidad sobre ecosistema.

## 4. Recomendación

**Next.js (App Router) + TypeScript + Supabase + Vercel**, con:

- **Supabase** como hasta ahora: base de datos, Auth, Storage. Sesión en
  servidor con `@supabase/ssr`. Tipos generados desde el esquema, para que un
  cambio en la base que rompa la web se detecte antes de publicar.
- **Sistema de diseño en código:** tokens (colores, tipografías, espacios)
  como variables CSS; el tema de cada producción se guarda en la base y se
  aplica sobreescribiendo solo esas variables (con validación de contraste).
  Tailwind CSS para aplicar los tokens de forma consistente.
- **Componentes propios accesibles** (botón, tarjeta, formulario, tabla,
  modal, mapa de asientos), apoyados en primitivas accesibles (Radix) donde
  convenga.
- **Rutas reales:** `/`, `/cartelera`, `/producciones/[slug]`,
  `/producciones/[slug]/funciones/[id]`, `/fan-zone/[slug]`, `/cuenta`,
  `/comprar/[funcion]`, `/admin/...`.
- **Configuración por entorno** (variables de Vercel por proyecto): URL y llave
  pública de Supabase, número de WhatsApp, remitente de correo. El proyecto
  DEV solo conoce DEV (se mantiene el chequeo de aislamiento).
- **Pruebas:** pruebas SQL de boletería (Postgres local), pruebas unitarias
  (Vitest) y pruebas de recorrido completo en navegador (Playwright) contra
  DEV: compra, aprobación, QR, permisos.
- **GitHub Actions** que en cada envío a `darf-2.0` corre: revisión de tipos,
  pruebas y chequeo de aislamiento. Si algo falla, se ve antes de revisar la
  web DEV.

## 5. Cómo se haría la transición (sin tocar la 1.0)

1. La app nueva vive en una carpeta `web/` dentro de `darf-2.0`. La web 1.0
   sigue intacta en `main`; arreglos urgentes de la 1.0 se hacen en `main`
   como hasta ahora.
2. El proyecto Vercel `darf-2-dev` pasa a construir `web/` (cambio de
   configuración del proyecto DEV, con aprobación).
3. Se construye por fases (visión §16): fundamentos y diseño → contenido
   editable y web pública → panel y permisos → boletería con su rediseño.
   La boletería nueva se valida contra la lista de pruebas obligatorias
   (visión §8.3) antes de considerarla lista.
4. Lista de equivalencia: cada función de la 1.0 (§2.3 de la visión) se marca
   cuando la 2.0 la cubre y pasó sus pruebas.
5. Publicación final (fase final de la visión): solo con aprobación, respaldo,
   plan de reversión y migración planificada de datos reales. Revertir =
   volver a publicar la 1.0 desde `main`.

## 6. Costos y riesgos a decidir aparte del framework

- **Vercel:** verificar el plan del equipo "DARF Productions". El plan gratuito
  (Hobby) de Vercel es para uso personal, no comercial; la venta de boletos es
  uso comercial. Plan Pro: alrededor de USD 20 al mes por miembro (verificar
  precio vigente). Aplica ya a la 1.0, no solo a la 2.0.
- **Supabase producción en plan Free:** sin respaldos automáticos descargables
  y con límites de uso. Para una boletería real se recomienda **Pro**
  (alrededor de USD 25 al mes, verificar) **antes** de publicar la 2.0, por
  los respaldos diarios. DEV puede seguir en Free (se pausa tras una semana
  sin uso; se reactiva desde el panel).
- **Dependencias:** Next.js y sus librerías se instalan con npm (requiere
  aprobación). Se fijan versiones y se actualizan a propósito.
- **Curva de aprendizaje:** mayor que el HTML actual; se compensa con
  convenciones escritas (un `CLAUDE.md` del proyecto) y pruebas automáticas
  que avisan cuando algo se rompe.

## 7. Qué se necesita de Johann

1. Elegir: **Next.js** (recomendado) o SvelteKit.
2. Aprobar instalar las dependencias y crear `web/` en `darf-2.0`.
3. Aprobar, cuando la base esté lista, que `darf-2-dev` construya `web/`.
4. Revisar el plan de Vercel y considerar Supabase Pro para producción.

## 8. Cómo se comprobará que funciona

- La primera entrega de la Fase 1 es un "esqueleto" en DEV: rutas, sistema de
  diseño aplicado a 2–3 pantallas, sesión con Supabase DEV, pruebas corriendo
  en GitHub Actions y el chequeo de aislamiento pasando.
- Criterio de salida de la Fase 1 (visión §16): estructura documentada y
  pruebas básicas funcionando en DEV.

## 9. Avance de la Fase 1 (2026-10-10)

- `web/` creado con Next.js **16.3.8** (no la 16.4.0, publicada 4 días antes),
  TypeScript, Tailwind 4, `@supabase/ssr` 0.12.7 y `@supabase/supabase-js`
  2.117.3 (versiones fijas). Auditoría de dependencias de producción: 0 avisos.
- Configuración por entorno (`NEXT_PUBLIC_*`, `web/.env.example`), franja de
  entorno de pruebas, `proxy.ts` que refresca la sesión (en Next 16
  "middleware" se llama "proxy").
- Tokens de la dirección A2 en `src/app/globals.css`; temas provisionales por
  obra en `src/lib/productions.ts`.
- Rutas: `/` (portada, DARF primero) y `/producciones/[slug]` (plantilla única
  que lee producción, funciones y precios de la base).
- GitHub Actions `DARF 2.0 CI` (solo `darf-2.0`): aislamiento, tipos, lint y
  build. Primera ejecución: **verde**.
- Tipografía: **una sola familia, Montserrat** (decisión de Johann); titulares en
  Montserrat Black.
- Portada: la obra destacada es la que está en cartelera; si no hay, la más
  reciente del archivo (por su última función con fecha; si no tiene, por fecha
  de alta). Reglas puras en `src/lib/home-rules.ts` con pruebas Vitest (5).
- Proyecto Vercel **`darf-2-web-dev`** (aprobado por Johann): raíz `web/`, solo
  rama `darf-2.0`, variables solo de Supabase DEV, Vercel Authentication en
  todos los despliegues. El proyecto `darf-2-dev` sigue sirviendo la 1.0 sobre
  DEV para probar la boletería.
- Pendiente: pruebas de navegador (Playwright) y pruebas SQL en CI.
