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
| H4 | Vercel: proyecto único `darf-productions` (scope de equipo `darf-productions`) que publica `main` como Production **y genera vistas previas (Preview) de otras ramas**. | **Confirmado** el 2026-10-09: el push de docs a `darf-2.0` (commit `563eeaa`) generó un despliegue `Preview` de `vercel[bot]`. Conector de Vercel: lista el proyecto, pero leer su configuración da 403 porque la autorización no incluye ese scope. | Alto mientras `darf-2.0` tenga la config de producción: cada push a `darf-2.0` publica una preview conectada a la base real. Hoy el código es idéntico a `main` (sin riesgo nuevo), pero **antes de cambiar código en `darf-2.0` hay que aplicar §3.1**. Falta confirmar si las previews están protegidas por Vercel Authentication. |
| H5 | `js/config.js` contiene la URL de Supabase de producción. | Código. | **Alto** para el desarrollo: cualquier copia del código (local, preview, Pages) habla con la base real. |

**Estado de las correcciones (2026-10-09):** Johann desactivó "Deploy to
production" (H2) y despublicó GitHub Pages (H1). H3 queda pendiente para
revisarlo juntos (hoy los cambios de la 1.0 se suben directo a `main`).

Verificado con el conector de Vercel (solo lectura, 2026-10-09):
- Proyecto `darf-productions`, sin framework, **sin variables de entorno**
  (la config de Supabase vive en `js/config.js`).
- Dominios: `darfproductions.com`, `www.darfproductions.com` y tres `*.vercel.app`.
- **Vercel Authentication activo** para todos los despliegues excepto los
  dominios propios: las previews y las URLs `*.vercel.app` solo las ven
  usuarios con sesión en el equipo de Vercel. Lo público es solo el dominio.
- Las previews de `darf-2.0` (commits `563eeaa`, `556b5fd`) se construyeron.
  Riesgo adicional si se usan como DEV dentro del proyecto de producción: un
  "Promote to Production" accidental pondría código DEV en el dominio real.

**Correcciones recomendadas originalmente:**

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

Proyecto DEV creado por Johann (2026-10-09): organización **"DARF 2.0 DEV"**,
proyecto **"DARF 2.0 DEV"** (ref `qgywscczyzuqinutuvak`, us-east-1). El
conector de Supabase de Claude **solo ve esa organización** (verificado con
`list_organizations`/`list_projects`); la ref es distinta a la de producción.
Sin migraciones aplicadas.

**Hallazgo H6 — las migraciones no reproducen la base desde cero:** las filas
de `productions` (`showman`, etc.) se insertaron a mano en producción y no
están en ninguna migración; `0018` asume que `showman` existe. Aplicar
`0001`–`0028` en una base vacía falla en `0018`. Para DEV: tras `0017`,
insertar las 3 producciones con los mismos `id` y nombres marcados
"(PRUEBA)"; después seguir con `0018`–`0028`.

Configuración de `darf-dev`:
1. Aplicar `0001`–`0017`, sembrar las 3 producciones de prueba, aplicar
   `0018`–`0028` (verifica que el repo reproduce el esquema).
2. Seed ficticio: 3 producciones de prueba, funciones de prueba, 725 asientos
   (sin datos personales).
3. Usuarios de prueba con correos controlados por Johann: Super Admin, admin,
   staff de puerta, fan.
4. Auth: redirecciones solo a la URL DEV; Google desactivado al inicio.
5. Correo: no desplegar `notify-contact` ni el webhook en DEV (o sin clave de
   Resend). Los correos de Auth solo a direcciones de prueba.
6. Ninguna copia de datos reales (personas u órdenes) sin autorización.

### 3.2.1. Construcción de la base DEV (2026-10-09)

- **0001–0008 aplicadas en DEV con el conector.** `0005` se aplicó en dos
  partes (`0005_profiles` + `0005b_profiles_auth_trigger`) sin la línea
  `drop trigger if exists` (en una base nueva no había nada que borrar).
- **Limitación del conector:** la herramienta de Supabase exige una
  confirmación extra para instrucciones `drop …`, que no llega a la sesión de
  Claude y la deja colgada. 16 migraciones (0009–0028) contienen `drop`.
- **Solución:** `supabase/dev/bootstrap_dev_0009_0028.sql`, generado
  mecánicamente por `supabase/dev/build_bootstrap.sh` (migraciones tal cual,
  sin `begin;`/`commit;` internos, en una sola transacción, con las 3
  producciones de PRUEBA antes de `0018`). Empieza con una **guardia** que
  aborta si la base no tiene la marca `darf_env.marker = 'DARF-2.0-DEV'`
  (creada en DEV con el conector; esquema no expuesto por la API).
  Johann lo ejecuta en el SQL Editor del proyecto DEV.
- **Probado en una Postgres 16 local** (con simulación mínima de `auth`,
  `storage` y los grants por defecto de Supabase): aplica completo; en una
  base sin la marca aborta sin crear nada.
- **Pruebas SQL del repo sobre la base reconstruida:** 0021, 0025, 0026,
  0027, 0028 pasan. **0022 y 0023 fallan por estar desactualizadas:** se
  escribieron antes del trigger de `0025` (que copia precios a cada función
  nueva) e insertan precios que ya existen. Con `on conflict do nothing` en
  esas inserciones pasan completas. Corregirlas queda para la Fase 1.

### 3.3. Vercel DEV

Proyecto separado `darf-2-dev` conectado al mismo repo, con rama de
producción `darf-2.0` y dominio `*.vercel.app`. El proyecto de producción no
se modifica. Gracias a §3.1, aunque el proyecto de producción generara una
preview de `darf-2.0`, esa preview usaría DEV.

### 3.3.1. Estado (2026-10-09)

- **Base DEV completa:** 0009–0028 aplicadas por Johann con el script
  guardado. Verificado con el conector: 30 migraciones registradas, 15 tablas,
  3 producciones "(PRUEBA)", 725 asientos, 5 zonas, 2 funciones sin fecha,
  10 precios, 35 políticas RLS, bucket `gallery`, 0 órdenes, 0 usuarios.
  Advisor de seguridad: solo avisos esperados (RPCs `SECURITY DEFINER` que
  validan permisos por dentro; `is_staff/is_admin` para `anon` es decisión ya
  documentada, Hallazgo #4). Nota para Fase 1: `handle_new_user()` (función de
  trigger) aparece ejecutable vía RPC; inofensivo (Postgres no deja llamar una
  función de trigger directamente) pero conviene revocarlo.
- **Rama `darf-2.0` apunta solo a DEV** (`js/config.js`, `ENV: 'DEV'`) con
  banner "ENTORNO DE PRUEBAS". `scripts/check-isolation.sh` pasa en DEV y falla
  con la config anterior (probado).
- **Proyecto Vercel `darf-2-dev`** creado por Claude con aprobación (mismo
  repo; *Ignored Build Step* que solo construye `darf-2.0`; Vercel
  Authentication en **todos** los despliegues; sin dominios propios). El
  proyecto de producción no se modificó (verificado después).
- El proyecto de producción sigue generando previews de `darf-2.0`; desde el
  commit `5accf36` esas previews usan DEV (inofensivo, protegidas por Vercel
  Authentication). Opcional: desactivarlas en el proyecto de producción.
- **Prueba en navegador desde el entorno de Claude: no posible** — la política
  de red del entorno bloquea `cdn.jsdelivr.net`, `cdnjs.cloudflare.com` y
  `*.supabase.co`. La prueba de aislamiento de extremo a extremo se hace con
  Johann en la web DEV (ver §3.4).

### 3.4. Verificación del aislamiento (evidencia requerida)

1. Búsqueda del identificador de producción en `darf-2.0` → 0 resultados.
2. Navegador automatizado sobre la web DEV registrando todas las peticiones de
   red → todas a `darf-dev`.
3. Orden de prueba en DEV → aparece en `darf-dev`.
4. Johann confirma en el panel de producción que no apareció nada nuevo.

### 3.4.1. Resultado de la prueba de extremo a extremo (2026-10-10)

Hecha por Johann en `https://darf-2-dev-darf-productions.vercel.app`, verificada
por Claude con el conector (solo DEV):

| Prueba | Resultado |
|---|---|
| Banner "ENTORNO DE PRUEBAS" visible | ✅ |
| Registro con correo + confirmación por enlace (Site URL/Redirect de DEV configurados) | ✅ usuario creado en DEV |
| Rol admin asignado en DEV | ✅ |
| Compra pública de 2 asientos (VIP-B-12, VIP-B-13), precio calculado en servidor | ✅ orden `DARF-ADB83A`, $800 |
| Aprobación desde el panel | ✅ `aprobado` |
| Mapa de staff refleja la venta | ✅ tras recargar (ver nota) |
| Mis Boletos + QR + PDF | ✅ |
| Validación de acceso (QR) en puerta | ✅ ambos boletos con `checked_in_at` |

**Nota de UX para Fase 4:** el mapa de Boletaje se guarda en memoria y solo se
recarga al cambiar de función o pulsar "Actualizar"; tras una compra puede
mostrar estado viejo. Debe actualizarse solo.

**Hallazgos de esta prueba (para fases siguientes):**
- Las páginas públicas de producción no leen la BD (los nombres "(PRUEBA)"
  solo se ven en panel, carrito y boletos) → Fase 2.
- El botón de pago abre el WhatsApp **real** de DARF también desde DEV
  (número en el código) → hacerlo configurable por entorno en Fase 1.
- Google Login no está configurado en DEV (solo correo).

### 3.5. Reversión

Producción nunca se toca. Deshacer = borrar `darf-dev` (y su organización),
borrar `darf-2-dev` en Vercel y revertir commits en `darf-2.0`.

---

## 4. Conectores de Claude y reglas de uso

- **Vercel:** conectado con acceso al equipo `darf-productions` (2026-10-09). **Ojo:** el conector incluye
  herramientas de escritura (crear o modificar proyectos, variables, dominios,
  despliegues). Regla: Claude solo usa herramientas de lectura sobre el
  proyecto de producción; cualquier escritura (incluido crear `darf-2-dev`)
  requiere aprobación explícita.
- **Supabase:** conectado **solo** a la organización "DARF 2.0 DEV".
  Producción no es accesible por esta vía.

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

**Hecho por Johann:** conectores de Vercel y Supabase (DEV), H1 y H2 corregidos,
base DEV aplicada, Auth de DEV configurado, prueba de extremo a extremo (§3.4.1).

**Fase 0 — criterio de salida:** cumplido en DEV; pendiente solo la confirmación
de Johann de que en producción no aparecieron el usuario de prueba ni la orden
`DARF-ADB83A`.

**Pendiente de aprobación de Johann (propuesto el 2026-10-09):**
1. Construir la base DEV (migraciones + producciones de prueba + datos ficticios).
2. Apuntar `js/config.js` de `darf-2.0` a DEV + banner "ENTORNO DE PRUEBAS"
   + script de verificación de aislamiento.
3. Crear el proyecto Vercel DEV separado (`darf-2-dev`, rama `darf-2.0`).
4. Compartir logo vectorial / manual de marca / fotos originales (para D1).
5. Más adelante: H3 (proteger `main`).

**Siguiente paso de Claude (tras lo anterior, en sesión nueva):**
- Revisar la configuración de Vercel (vistas previas, variables, dominios) en
  solo lectura.
- Proponer y, con aprobación, preparar `darf-dev` (migraciones, seed ficticio,
  usuarios de prueba), apuntar `js/config.js` de `darf-2.0` a DEV y ejecutar la
  verificación de §3.4.
- Arrancar D1 si está aprobado.
