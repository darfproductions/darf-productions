# DARF 2.0 — Fase 0: auditoría, hallazgos y plan de aislamiento

Documento de traspaso entre sesiones de trabajo con Claude Code. Visión
completa del proyecto: `docs/DARF-2.0-VISION.md`. Arquitectura de la 1.0:
`docs/ARCHITECTURE.md`, `docs/DATABASE.md`.

**Para retomar en una sesión nueva:** leer este archivo y
`docs/DARF-2.0-VISION.md`, revisar la sección "Estado y siguiente paso" al
final, y continuar desde ahí. Nada de lo propuesto aquí está autorizado
automáticamente: cada acción externa o sensible requiere aprobación explícita
de Johann (ver sección 17.2 de la visión).

---

## 1. Auditoría de la 1.0 (solo lectura, 2026-10-09)

### 1.1. Repositorio

- Ramas: `main` (1.0 publicada) y `darf-2.0` (desarrollo). Al iniciar la
  Fase 0 apuntaban al mismo commit (`2356384`). Sin pull requests.
- Sitio estático sin build: `index.html` (~1,270 líneas, 13 vistas),
  `js/app.js` (~2,200 líneas, toda la lógica), `css/styles.css` (672 líneas),
  `js/config.js` (URL + publishable key de Supabase **de producción**).
- Librerías por CDN con versión fija: supabase-js 2.116.0, qrcode 1.5.1,
  jsPDF 2.5.1, html5-qrcode 2.3.8.
- `supabase/`: 28 migraciones (`0001`–`0028`), pruebas SQL (`supabase/tests/`),
  Edge Function `notify-contact` (Resend), seed de 725 asientos de Showman.
- No hay `vercel.json`, ni `package.json` funcional, ni pruebas del frontend.

### 1.2. Qué está en la base de datos vs. en el código

**En Supabase (editable desde el panel):** producciones, funciones, "en venta",
asientos, zonas y precios, órdenes, boletos, vendedores, códigos de descuento,
mensajes de contacto, perfiles, fotos de galería (Storage `gallery`).

**Escrito en el código:** páginas completas de Mamma Mia, HSM y Showman
(sinopsis, canciones, reparto, equipos, agradecimientos), 14 videos de YouTube,
la Fan Zone, textos de portada/cartelera/archivo/contacto, redes y WhatsApp,
Audiciones (letrero fijo), DARFY (4 respuestas fijas en rotación). Showman
aparece como caso especial en `js/app.js`. Una producción creada desde el
panel no tiene página pública.

### 1.3. Boletería: lo que hay que preservar

`create_seated_ticket_order` (v3, con descuentos), índice único anti-doble
venta `tickets(performance_id, seat_id) where is_active`, precio siempre
calculado en servidor (`tickets.unit_price` congelado), `get_taken_seats`,
`admin_create_seated_order`, `admin_cancel_ticket`, `check_in_ticket`,
`approve_order`/`reject_order`, `preview_discount_code`, `qr_token` de boletos
emitidos, flujo de pago por WhatsApp, RLS por rol. Regla: nunca editar una
migración ya aplicada.

Deuda conocida: órdenes `pendiente` apartan asientos sin vencimiento
(`orders.expires_at` existe sin uso). Permisos solo globales
(`fan`/`staff`/`admin`). `docs/ARCHITECTURE.md` dice "venta en pausa" pero el
checkout ya está activo; `docs/DATABASE.md` marca 0024/0025 como "pendiente
de aplicar" — **el estado real en producción no está verificado**.

### 1.4. Diseño actual

- Reutilizable: variables CSS de paleta (incluidos colores por producción),
  lógica de mapa de asientos, carruseles, lector QR y PDF.
- Replantear: ~430 estilos en línea en `index.html` y ~70 en `js/app.js`;
  diseño "desktop-first"; una sola tipografía (Montserrat); 28 de 40 imágenes
  sin `alt`; ~38 elementos clicables que no son botones; sin estilos de foco ni
  `prefers-reduced-motion`; sin carga diferida.
- **Imágenes:** las carpetas `*VISUALS` pesan ~100 MB; `HIGH SCHOOL MUSICAL
  VISUALS/4.png` (~25 MB) se usa 5 veces. Prioridad de rendimiento.
- Logo solo en PNG (`DARF PRODUCTIONS LOGOS/1.png`, `2.png`); falta vectorial.

---

## 2. Hallazgos de despliegue e infraestructura

| # | Hallazgo | Evidencia | Riesgo |
|---|---|---|---|
| H1 | **GitHub Pages publica `main`** en `https://darfproductions.github.io/darf-productions/` (rama `main`, carpeta raíz, sin dominio propio). Segunda copia pública de la web, conectada a la Supabase de producción. | Captura de Settings → Pages (Johann, 2026-10-09); 13 ejecuciones de `pages-build-deployment`. | Medio. No afecta a `darfproductions.com` (Pages no tiene dominio propio), pero es una puerta extra a la boletería real que nadie usa. Cualquier cambio en `main` también se publica ahí. |
| H2 | **Integración GitHub ↔ Supabase de producción con "Deploy to production" ACTIVADO**, rama de producción `main`, directorio `.`. Plan **Free** (branching no disponible). | Captura de Supabase → Integrations → GitHub (Johann, 2026-10-09); check run "Supabase Preview" en cada commit de `main`. | **Alto.** Al llegar a `main` una migración nueva en `supabase/migrations/`, Supabase la aplica **automáticamente** a la base real. Un merge de `darf-2.0` → `main` aplicaría todas las migraciones de 2.0 a producción sin revisión. También explica por qué el estado real de 0024/0025 es incierto. |
| H3 | `main` **sin protección de rama**. | API de GitHub (`protected: false`). | Medio. Un push directo (persona o herramienta) publica en Vercel, GitHub Pages y, con H2, puede alterar la base real. |
| H4 | Vercel: proyecto único `darf-productions` (scope de equipo `darf-productions`) que publica `main` como Production. Sin registros de despliegues *Preview* en GitHub. | API de GitHub (9 despliegues `Production` por `vercel[bot]`). Conector de Vercel: lista el proyecto, pero leer su configuración da 403 porque la autorización no incluye ese scope. | Por confirmar: si las vistas previas de ramas están activas y qué variables reciben. Mitigado por la estrategia de §3.1. |
| H5 | `js/config.js` contiene la URL de Supabase de producción. | Código. | **Alto** para el desarrollo: cualquier copia del código (local, preview, Pages) habla con la base real. |

**Correcciones recomendadas (requieren decisión y acción de Johann; cambian
configuración de producción, no la operación de la web):**

1. H2 → desactivar "Deploy to production" en la integración de Supabase
   (las migraciones se siguen aplicando de forma manual y revisada, como
   indica la documentación del proyecto). Antes, confirmar que no hay
   migraciones pendientes que dependan de ese automatismo.
2. H1 → despublicar GitHub Pages si no se usa (no afecta a Vercel ni al dominio).
3. H3 → proteger `main` (exigir PR, prohibir force-push y borrado).

---

## 3. Plan de aislamiento DEV

### 3.1. La app de desarrollo no puede hablar con producción

- En la rama `darf-2.0`, `js/config.js` contendrá **solo** la URL y la
  publishable key del proyecto Supabase DEV. La referencia de producción se
  elimina de la rama y solo vuelve en la migración final aprobada.
- Prueba automática: buscar el identificador del proyecto de producción en
  toda la rama → debe dar 0 resultados.
- Banner visible "ENTORNO DE PRUEBAS" en toda la web DEV.
- Datos ficticios fácilmente reconocibles (p. ej. "Showman (PRUEBA)").
- Si en la Fase 1 se adopta un framework con build, las credenciales pasan a
  variables de entorno por proyecto de Vercel; el proyecto DEV solo conoce DEV.

### 3.2. Supabase DEV (estrategia A + B)

- **A — Proyecto Supabase DEV separado**, en una **organización separada**
  (`DARF DEV`, plan Free), de modo que el conector de Supabase de Claude se
  autorice **solo** a esa organización y no tenga ninguna vía técnica hacia
  producción. Proyecto: `darf-dev`, misma región que producción.
- **B — Supabase local** (CLI + Docker dentro del entorno de trabajo de Claude)
  para pruebas automáticas de boletería. Instalar la CLI requiere aprobación.
- **Descartado:** Supabase Branching (requiere Pro; ligado a PRs hacia `main`).
- **No conectar el repositorio de GitHub al proyecto DEV** por ahora: las
  migraciones de DEV se aplican de forma deliberada (primero en local con
  pruebas, luego en `darf-dev`), no automáticamente en cada push. Evita
  aplicar migraciones a medio hacer y evita dos proyectos ligados al mismo repo.

Configuración de `darf-dev`:
1. Aplicar `0001`–`0028` en orden (verifica que el repo reproduce el esquema).
2. Seed ficticio: 3 producciones de prueba, funciones de prueba, 725 asientos
   (sin datos personales).
3. Usuarios de prueba con correos controlados por Johann: Super Admin, admin,
   staff de puerta, fan.
4. Auth: redirecciones solo a la URL DEV; Google desactivado al inicio.
5. Correo: no desplegar `notify-contact` ni el webhook en DEV (o sin clave de
   Resend). Los correos de Auth solo a direcciones de prueba.
6. Ninguna copia de datos reales (personas u órdenes) sin autorización.

### 3.3. Vercel DEV

Proyecto separado `darf-2-dev` conectado al mismo repo, con rama de
producción `darf-2.0` y dominio `*.vercel.app`. El proyecto de producción no
se modifica. Gracias a §3.1, aunque el proyecto de producción generara una
preview de `darf-2.0`, esa preview usaría DEV.

### 3.4. Verificación del aislamiento (evidencia requerida)

1. Búsqueda del identificador de producción en `darf-2.0` → 0 resultados.
2. Navegador automatizado sobre la web DEV registrando todas las peticiones de
   red → todas a `darf-dev`.
3. Orden de prueba en DEV → aparece en `darf-dev`.
4. Johann confirma en el panel de producción que no apareció nada nuevo.

### 3.5. Reversión

Producción nunca se toca. Deshacer = borrar `darf-dev` (y su organización),
borrar `darf-2-dev` en Vercel y revertir commits en `darf-2.0`.

---

## 4. Conectores de Claude y reglas de uso

- **Vercel:** conectado a la cuenta de Johann el 2026-10-09, pero sin acceso
  al scope de equipo `darf-productions` (403). **Ojo:** el conector incluye
  herramientas de escritura (crear o modificar proyectos, variables, dominios,
  despliegues). Regla: Claude solo usa herramientas de lectura sobre el
  proyecto de producción; cualquier escritura (incluido crear `darf-2-dev`)
  requiere aprobación explícita.
- **Supabase:** pendiente. Autorizarlo **solo** a la organización `DARF DEV`.
  Si la pantalla de autorización no permite elegir organización, detenerse.

---

## 5. Diseño (en paralelo, sin tocar la web)

- **D1:** inventario de material (logo vectorial, manual de marca, fotos
  originales), referencias (Broadway/West End, productoras, boleteras con
  buena compra móvil) y 2–3 direcciones que combinen glamour teatral,
  energía contemporánea y estilo editorial (ver §4.1 de la visión).
- **D2:** sistema visual y maquetas navegables (móvil y escritorio) de las
  pantallas de §4.6 de la visión, presentadas como páginas privadas de muestra
  fuera del repositorio.
- Arquitectura visual propuesta: identidad DARF (tokens) → tema por producción
  (guardado en BD, editable desde el panel, con límites de contraste) →
  componentes → plantillas de pantalla.

---

## 6. Estado y siguiente paso

**Hecho:**
- Auditoría de código, base de datos (por migraciones), diseño y despliegues.
- Revisión de GitHub Pages e integración de Supabase (capturas de Johann).
- Visión y este plan guardados en `docs/`.

**Pendiente de Johann:**
1. Reautorizar el conector de Vercel incluyendo el scope `darf-productions`.
2. Crear la organización `DARF DEV` + proyecto `darf-dev` en Supabase y
   autorizar el conector de Supabase solo a esa organización.
3. Decidir sobre H1 (GitHub Pages), H2 (Deploy to production) y H3 (proteger `main`).
4. Compartir logo vectorial / manual de marca / fotos originales (para D1).

**Siguiente paso de Claude (tras lo anterior, en sesión nueva):**
- Revisar la configuración de Vercel (vistas previas, variables, dominios) en
  solo lectura.
- Proponer y, con aprobación, preparar `darf-dev` (migraciones, seed ficticio,
  usuarios de prueba), apuntar `js/config.js` de `darf-2.0` a DEV y ejecutar la
  verificación de §3.4.
- Arrancar D1 si está aprobado.
