# DARF Productions — Changelog

Historial de cambios significativos al proyecto (esquema de datos,
arquitectura, decisiones de producto). No es un changelog de cada commit —
para eso está `git log`. Este documento registra *por qué* cambió algo, no
solo *qué*.

## 2026-10-19 — Editor de mapas: zonas por asiento, quitar asientos y filas distintas

- Modo "Zonas y asientos" en el editor: seleccionar asientos (tocar, rectángulo, letra de fila, fila o bloque completo),
  darles zona (Preferente, Discapacitados…), regresarlos a la zona del bloque, quitarlos o volver a ponerlos.
  Los quitados no gastan número: la numeración de la fila se recorre.
- "Cada fila con distinto número de asientos" (ej. 15, 16, 17, 19) además de "primera fila + crece".
- Todo vive en el diseño (`Bloque.porFila`, `zonasAsiento`, `quitados`); sin cambios en la base.
- Las letras de fila van en las puntas de cada bloque (un hueco no parte la fila).
- Pendiente anotado: mapas con varios pisos.

## 2026-10-19 — Números de audición por personaje (migración 0116)

- Nueva opción en "Números del día": **por personaje**. Al inscribirse nadie tiene número; al cerrar inscripciones
  (estado "cerrada" o fecha de cierre, revisada cada 15 min con `darf_numeros_audicion`) se reparten con
  `audition_numerar_personaje`: primero el personaje más importante (orden de la convocatoria); quien elige varios va
  con el más importante; sin personaje al final; dentro de cada grupo, por orden de inscripción. Aviso a cada cuenta.
- Quien se registra en la entrada el día de la audición pasa al último. En Registro: "Asignar lugares ahora" y flechas
  para mover a alguien después.
- Arreglo: la consulta de "mi solicitud" (`auditions(...)` desde `audition_applications`) era ambigua desde 0089 por
  `audition_cast`; ahora nombra la relación. Sin esto el aspirante no veía "Ya estás inscrito" ni su número.
  0115 ya no pone llave foránea en `auditions.en_escena` por la misma razón.

## 2026-10-19 — "En escena" en audiciones (migración 0115)

- `auditions.en_escena`: el host (o quien gestiona) pone a alguien en escena o usa "Pasar al siguiente"
  (`audition_en_escena`, `audition_siguiente`); se marca solo que entró y que el anterior terminó.
- Pantalla del juez (Evaluación): arriba sale quien está en escena y cambia sola cada 4 s
  (`audition_juez_actual`): foto, edad, papeles que quiere, **respuestas del formulario de inscripción**, entrevista
  que guarda el host, historial en DARF y su rúbrica. Sin datos de contacto. Lo que el juez escribe no se pierde.
- Antes los jueces solo veían las ligas del formulario, no las respuestas de texto. Ahora también salen en la
  ficha del aspirante.

## 2026-10-16 — Fotos de tu función, regalo de cumpleaños, kit de prensa y filas en el mapa (migración 0114)

- **Fotos de cada función:** `gallery_photos.performance_id`. En Fan Zone del panel se elige la función y se suben
  varias fotos a la vez; "Avisar a quienes fueron" (`fotos_funcion_avisar`) manda un solo aviso a quien tuvo boleto
  aprobado y queda registrado en `fotos_funcion_avisos` (no se repite). Página pública `/producciones/<obra>/fotos`.
- **Regalo de cumpleaños del Club Fan:** cada mañana (`darf_cumple`) los socios que cumplen ese mes reciben un código
  personal `CUMPLE-XXXXXX` (`regalos_cumple`): 10 % en hasta 2 boletos, una compra, cualquier obra, todo el mes.
  `_resolve_discount_code` lo convierte al usarlo en un código normal de esa obra (`discount_codes.regalo_id`) y
  revisa que lo use su dueño y una sola vez; no aparece en la lista de Descuentos de la obra. Se ve en Mi cuenta.
- **Kit de prensa:** `/producciones/<obra>/prensa` (pública, sin menú): logo, pósters, imagen de ambiente, fotos en
  tamaño original, sinopsis, ficha, funciones, créditos y contacto para medios. Liga al final de la página de la obra.
- **Mapa libre:** la letra de la fila sale en las puntas de cada fila (compra, taquilla, panel y editor).

## 2026-10-16 — Mapa de asientos libre (migración 0113)

- Cada asiento puede tener posición (`seats.pos_x`/`pos_y`). La compra, la taquilla y el panel lo dibujan tal cual
  (escenario redondo, pasarela, 360°, pasillos donde sea). El mapa por filas de siempre sigue igual (sin posición).
- Editor en Boletos → Mapa de asientos: plantillas (frontal, con pasarela, 360°, arena), bloques rectos o en arco,
  figuras (escenario, pasarela) que se arrastran con el mouse o el dedo. La numeración (fila + número) sigue de un
  bloque a otro y **nunca se repite** en toda la obra (Diego: "nunca debe haber dos A1, aunque sean diferentes zonas").
  Los asientos sin zona van a "General"; las zonas y precios se acomodan después.
- `seat_map_disenar` guarda asientos + diseño. El diseño vive en `mapas_diseno` (no en `productions`) para no
  disparar la revisión del kit de publicar, los avisos de Wallet ni la bitácora de la obra al guardar el mapa.
- Copiar el mapa de otra obra y los teatros guardados llevan las posiciones y el diseño.

## 2026-10-15 — Host de audición, personajes por crédito, teatros guardados, Club Fan y medidas (migración 0112)

- Rol **Host de audición** (`audiciones.entrevista`): pestaña "Entrevista" en la convocatoria con las preguntas de
  `auditions.preguntas_entrevista` (3 de base, editables) y un espacio adicional; se guarda en
  `audition_applications.entrevista`/`entrevista_extra` y sale en la ficha de talento (`talent_history`).
- QR descargable de cada convocatoria (lleva a `/audiciones/[id]`).
- `credit_characters`: un crédito de Reparto tiene uno o varios personajes de la lista; `papel` se arma solo
  ("A / B"). Los personajes dobles de la lista y los créditos "A / B" se separaron al aplicar la migración.
- `teatros`: guardar el mapa de asientos con el nombre del teatro y usarlo en otra obra (`teatro_guardar`, `teatro_usar`).
- Expedientes → pestaña **Cuotas y recaudación** (antes escondido al final de la página).
- `club_socios()` y página **Ajustes → Club Fan** (permiso de Casa DARF `casa.club`) con exportar a Excel.
- Medidas de vestuario completas (tabla de DARF): 15 columnas nuevas en `person_files` y descarga en Excel para vestuario.

## 2026-10-15 — Dirección general, cuenta de la empresa, cuentas vacías, Difusión y pagos por ficha (migración 0111)

- Rol `direccion_general_darf` ("Dirección general"): quien está en `direccion_general_darf` (Diego) entra solo a
  todas las obras (trigger en `productions`) y eventos (`evento_equipo` organiza), con acceso total
  (`es_direccion_general`). Solo recibe avisos importantes (órdenes y pagos, audiciones, ofertas, solicitudes de pago);
  no lo citan a ensayos ni sale en listas del equipo. No se da ni se quita desde Permisos. El rol de cada obra
  `direccion_general` ahora se llama "Dirección de la obra".
- `cuentas_empresa` (DARF Productions): sigue admin, sin Club Fan, credencial ni Wallet; fuera del Directorio y del equipo.
- `cuentas_vacias()` / `admin_borrar_cuenta()`: el admin borra cuentas sin ficha, obras, compras ni registros
  (Directorio → "Cuentas vacías"); en la Bitácora queda solo que se borró.
- Wallet: el reverso ya no lleva el nivel de DARF Loyalty ni de Fan Zone.
- Pestaña **Difusión** (grupo Público): 10 diseños para redes (post e historia) con el estilo de la tarjeta del elenco.
- Pagos por ficha (`member_payments_ficha`, `ficha_cuotas`): pasan solos a la cuenta al ligarla, sin aviso;
  salen en Adeudos como "Sin cuenta" y en la recaudación. `production_fees.vence_sabado`: vence el segundo sábado.
- Script de datos `supabase/dev/carga_pagos_showman_2026-10-15.sql`: cuotas de Showman ($600 inscripción y mensualidad)
  y la hoja de pagos de Diego.

## 2026-10-15 — Elenco programado, tarjeta para redes, aviso al Club Fan, ranking y visitas en puerta (migración 0110)

- `production_credits.publicar_at` (pg_cron `darf_elenco_programado` cada 5 min) y `avisar_club` (notificación
  `fanzone` a `fan_members`; "Publicar todo" manda una sola con `elenco_avisar_club`).
- Tarjeta para redes: `/panel/producciones/[id]/elenco/tarjeta/[credito]?f=post|historia` (next/og + sharp).
- `director_sellers()` con boletos; ranking por boletos en reportes y vendedores.
- `visitas_puerta` + `puerta_visita()`: el escáner de la puerta lee boletos y pases del Club Fan; la visita cuenta
  con el pase (tope: boletos que ya entraron). `fan_visitas()` conserva lo ganado con boletos antes del cambio.
- Página de la obra: "Ver video(s)"; perfil profesional por año y retrato sin hueco (#21, #22).

## 2026-10-15 — Asistencia histórica y "Solo crédito" (migración 0109)

- `rehearsal_attendance_ficha`: asistencia guardada por ficha mientras no hay cuenta; al ligar la cuenta pasa sola
  a `rehearsal_attendance` con `historico = true` y recorre su ingreso al primer ensayo registrado.
- Lo histórico no genera ni cuenta para advertencias automáticas (`rehearsal_auto_warnings`).
- `production_credits.solo_credito`: crédito de Reparto/Ensamble sin rol integrante (producción que sale de personaje).
- `people_merge` conserva la asistencia histórica.
- Script de datos `supabase/dev/carga_asistencia_showman_2026-10-15.sql`: 19 ensayos de Showman (8 pasados y 11 siguientes),
  asistencia de los 8 pasados, 4 bajas y 10 de producción como solo crédito.

## 2026-10-15 — Editar el nombre de una ficha (sin migración)

- Ficha de persona (con o sin cuenta) → "Editar nombre": es el nombre de los créditos en todas sus obras.
  Solo admin y Casa DARF con `casa.personas`. La Bitácora muestra "Cambió el nombre en los créditos: ahora es …".
- Script de datos `supabase/dev/carga_creditos_2026-10-15.sql`: staff de HSM y MM, personajes y reparto de Showman.

## 2026-10-15 — Avisos y bitácora del elenco sin publicar (migración 0108)

- Bandeja "Por hacer" del panel: "N personas del elenco sin publicar" por obra viva (para quien arma el elenco),
  con liga a Elenco. "Listo para vender" lo muestra como punto opcional (no impide vender).
- Vista previa: los retratos del perfil profesional salen también para quien edita la obra aunque la persona
  no esté publicada (`production_pro_info`). El público sigue viendo solo lo publicado.
- Bitácora: "Publicó a Ana como Brady en Showman" / "Quitó de la página a…" (filtro "Elenco y expedientes").
- Ideas para después (en `DARF-2.0-UI-PENDIENTES.md`): publicación programada, tarjeta para redes y aviso al Club Fan.

## 2026-10-15 — Elenco "No publicado" (migración 0107)

- `production_credits.publicado`: lo que ya existía queda publicado; cada persona nueva de **Reparto o Ensamble**
  (panel, oferta aceptada u obra duplicada) entra sin publicar. Los demás equipos salen como antes.
- El público (página de la obra, programa, perfil profesional, nombres de personas, cifras del inicio) solo ve
  lo publicado. El equipo de la obra y la vista previa del panel ven todo.
- Panel → Elenco: etiqueta "No publicado", botones Publicar/Despublicar por persona y "Publicar todo el elenco".
  Publicar no cambia el acceso de integrante (0106).

## 2026-10-15 — Staff de producción y acceso automático del elenco (migración 0106)

- Crédito tipo **staff**: lista de nombres sin puesto dentro del Equipo de producción (página de la obra y programa).
  En el gafete cuenta como Staff. Vale en ofertas, documentos y ensayos por grupo.
- Agregar a alguien con cuenta en **Reparto o Ensamble** (o ligar su ficha) le da el rol integrante de esa obra si
  está viva (borrador o publicada, no concluida). Se aplicó una vez a lo que ya existía.
- Apple Wallet: Casa DARF usa el azul del holográfico (#9fe2ff) como color de acento.

## 2026-10-15 — Buscar por nombre, Nosotros desde Casa DARF y "Cambiar cuenta" (migración 0105)

- **Buscar por nombre**: `buscar_cuentas(q)` (nombre o correo, correo enmascarado) y `cuenta_correo(id)` para quien
  maneja algo en el panel. Los 8 formularios de agregar a alguien usan el buscador; el campo manda "cuenta:<id>".
- **Nosotros** sale de Casa DARF (`casa_members.en_nosotros`, orden de los puestos); Equipo DARF (team_members) queda
  sin uso y su pestaña se quitó. El portal del equipo general incluye a Casa DARF.
- **Cambiar cuenta** de una ficha en el Directorio (duplicados al registrarse dos veces).

## 2026-10-15 — Directorio sin "Staff" y Google Wallet para todos (sin migraciones)

- **Directorio**: el rol general queda en "Cuenta" o "Admin (dueño)". "Staff" ya no se asigna (nadie lo
  tenía y daba acceso a datos de compradores de todas las obras); lo cubren Casa DARF y los roles de obra.
  Se ve el puesto de Casa DARF de cada cuenta y el filtro "Casa DARF y admin".
- **Google Wallet**: Google aprobó la publicación; el botón ya no está limitado al equipo.
- Guía nueva en `docs/DARF-2.0-GUIA-PANEL.md`.

## 2026-10-14/15 — Medallas, Casa DARF y Dirección general (migraciones 0099–0104)

- **0099 Ensayos**: también se cita al equipo de producción; encargados que abren el ensayo y pasan lista.
- **0100 Asistente artístico** y propuestas de calificación en la rúbrica.
- **0101 Dirección general de la obra**: todo dentro de su obra, gafete plateado; revisa, regresa y publica
  las calificaciones (al entregarse se bloquean). Producción queda con 20 permisos; Maquillaje → Estilismo.
- **0102 Casa DARF**: puestos globales de la empresa con nombre propio (sin predeterminados); 11 permisos
  `casa.*` que sustituyen al "solo el Director" en producciones, sitio, eventos, audiciones, club, personas,
  equipo, contacto, reportes, roles y bitácora. Gafete holográfico con sello. Seis puestos se crean con
  `supabase/dev/casa_puestos_dev.sql`.
- **0103 DARF Loyalty**: `lealtad_producciones` cuenta obras en equipo o elenco (sin canceladas ni bajas).
  Niveles en piedras preciosas desde 3; medalla generada con el número exacto; barra en Mi cuenta.
- **0104 Medalla de fans**: `fan_visitas` cuenta funciones con boleto propio escaneado y eventos de Fan Zone
  con llegada. Niveles de butaca en metales; solo socios; se ve solo en la Fan Zone.
- **Credencial**: logo DARF Productions arriba y sellos en fila. Las medallas solo en la página; PDF y Wallet
  llevan solo Club Fan y Casa DARF.

## 2026-10-12 — Nueva piel con el Kit de Marca y la guía de UI (sin migraciones)

- Colores exactos del kit, logos e íconos oficiales, botones en píldora, tarjetas de 22 px.
- Marco nuevo (barra "Jóvenes para jóvenes", encabezado, menú de celular, pie), inicio,
  página de obra (estados de venta por función, zonas con color, barra de compra en celular),
  cartelera con Archivo y Fan Zone en el mundo Oro. El panel solo toma colores y botones.
- Funciones nuevas de la propuesta: anotadas en `docs/DARF-2.0-UI-PENDIENTES.md`, no se muestran.

## 2026-10-06 — Códigos de descuento, galería desde el panel y boleto en PDF (migraciones 0027 y 0028)

- **Códigos de descuento** (panel → producción → "Códigos de descuento"): porcentaje, zonas
  (ninguna = todas), funciones (ninguna = todas), vigencia, usos totales y máximo de boletos
  por compra. "Uso" = una orden `pendiente` o `aprobado`; rechazar o expirar libera el uso.
  Si la orden excede el máximo de boletos del código, no se puede usar. El descuento se calcula
  solo en `create_seated_ticket_order` v3 (el cliente solo envía el texto); `tickets.unit_price`
  guarda el precio ya descontado y la fila del código se bloquea para no exceder los usos en
  compras simultáneas. El comprador ve su código en `orders.discount_codigo`; la tabla de
  códigos solo la lee un admin. Borrar un código ya usado solo lo desactiva.
- **Checkout:** campo de código con vista previa (`preview_discount_code`), línea de descuento y
  avisos; Mis Boletos, el mensaje de WhatsApp y las solicitudes pendientes muestran el código.
- **Galería:** el admin sube fotos por producción (Galería o Ensayos de la Fan Zone); se reducen
  en el navegador a 1600 px JPEG y se guardan en Storage (`gallery`). Las galerías públicas
  (Mamma Mia, HSM, y un carrusel nuevo en Showman) las leen; sin fotos quedan los recuadros de ejemplo.
- **Boleto en PDF:** jsPDF (CDN con SRI) genera una página de 100×180 mm por boleto, con QR,
  desde el modal del boleto y desde cada orden aprobada en Mis Boletos. **Wallet queda pendiente**
  (ver ARCHITECTURE).
- **Videos nuevos:** pro-shots de Mamma Mia y HSM en la sección pública; en la Fan Zone, 4 ensayos
  de HSM y 8 de Mamma Mia (los tres de "Escena 4", "Does Your Mother Know" y "Mamma Mia x Dancing
  Queen" apuntan hoy al mismo video, por confirmar).
- **Fan Zone de Showman:** tarjeta y sub-página nuevas (videos pendientes; galería de ensayos).
- **Todas las galerías son carruseles** (públicas y de ensayos de la Fan Zone, incluida Showman).
- **Panel de staff:** las secciones principales se pliegan y despliegan desde su encabezado.

## 2026-10-06 — Ronda de arreglos tras pruebas en vivo (migración 0026, pendiente de aplicar)

- **Comprador sin precios (colores y total):** la política `performance_prices_public_read`
  exigía `productions.on_sale = true`, pero Showman vende por función (0023). El fan veía
  0 precios: mapa sin color de zona y total $0. La migración `0026` la alinea con la regla
  de venta (función en venta + con fecha + producción no concluida).
- **Mapa de compra:** los asientos disponibles se rellenan con el color de su zona; la
  leyenda muestra cada zona con su precio. Si una función no trae precios, se avisa en
  lugar de mostrar un mapa sin colores.
- **Zonas renombradas (precios sin cambio):** Exclusivo → **VIP** ($400, A–B),
  VIP → **Preferente A** ($350, C–I), Preferente → **Preferente B** ($300, J–Q).
  General ($250) y Discapacitados ($300) igual. Las etiquetas de asiento cambian de
  prefijo (`VIP-A-1`, `Preferente A-C-1`, `Preferente B-J-1`); `section` no cambia.
  Las pruebas 0021–0023 usan ahora `Preferente B-K-…`.
- **Perfil:** el nombre es editable y se puede guardar un teléfono (`profiles.telefono`,
  RLS de dueño); el teléfono se prellena en el checkout.
- **Sesión al refrescar:** el enrutado inicial esperaba a la sesión; ahora `restoreSession()`
  se resuelve antes de navegar, y `?v=cuenta` ya no manda a login.
- **Videos:** el iframe de YouTube se posiciona de forma absoluta dentro del recuadro 16:9.
- **Aviso de contactos por correo:** Edge Function `notify-contact` (Resend) invocada por un
  Database Webhook en `contact_messages`. Requiere secretos y webhook configurados por Johann.

## 2026-10-06 — Zona General en Showman (migración 0024, pendiente de aplicar) y validación QR

- **Decisión de Johann:** filas J–Q siguen como Preferente a $300; filas R–X
  pasan a **General** a $250 c/u (227 asientos; Preferente queda en 242). Reemplaza
  la decisión del 2026-10-05 de que no existiera zona General.
- La migración `0024` crea la categoría, reasigna asientos (categoría, zona
  `Zona Verde` y etiqueta `General-…`) y agrega el precio a cada función. Se
  detiene si hubiera boletos en esas filas. Las pruebas 0021–0023 usan ahora
  asientos `Preferente-K-…`.
- El mapa muestra la zona General (verde lima) en la leyenda y en los asientos.
- Migración `0025` (pendiente): una función creada desde el panel hereda los
  precios de la función más reciente; antes nacía sin precios y no se podía comprar.
- Control de Accesos: el marco del escáner queda centrado y cuadrado, el
  estado ("Esperando…", nombre/asiento, "Ya utilizado") ya no se desplaza, y el
  área de lectura de la cámara se ajusta al marco.

## 2026-10-06 — Checkout público real (migración 0023, pendiente de aplicar)

- "En venta" de una función (con fecha) activa el botón "Comprar Boletos" en la
  página de Showman. Ya no depende de `productions.on_sale`.
- Checkout con los 725 asientos reales, precios por zona y selector de función;
  crea una orden `pendiente` con `create_seated_ticket_order` (requiere sesión).
  Las órdenes pendientes **apartan** sus asientos hasta que un admin las aprueba o
  rechaza. Máximo 3 pendientes por usuario. Código de vendedor opcional.
- `get_taken_seats(performance)`: lectura pública de ids de asientos no
  disponibles (sin datos de compradores).
- Staff: lista "Solicitudes pendientes" con Aprobar/Rechazar (admin) en Boletaje.
- Mis Boletos lee de Supabase (QR = `tickets.qr_token`); pendientes con botón de
  pago por WhatsApp.
- Ventas de Cartelera: conteo de Showman desde Supabase.
- Código del prototipo localStorage de órdenes (`DB.createOrder`, etc.) quedó sin uso.

## 2026-10-05 — Panel de staff: concluidas, eliminar función, bases de datos

- Gestión de Producciones: las producciones concluidas se agrupan en una carpeta
  colapsable "Producciones concluidas" al final.
- Eliminar función: botón por función y RPC `admin_delete_performance`
  (migración 0022, **pendiente de aplicar**). Solo admin; se rechaza si hay boletos
  activos. Los boletos cancelados y sus órdenes se borran con la función porque
  `orders`/`tickets` → `performances` no tienen cascade.
- Nueva sección "Bases de Datos" (solo lectura, Supabase): compradores (boletos con
  orden, teléfono, asiento, estado, vendedor, búsqueda) y estadísticas por zona
  (capacidad, vendidos, ingresos, disponibles, bloqueados) por función o todas.
  Reemplaza la "base de datos de boletos" del prototipo localStorage, retirada
  con el mapa interactivo.

## 2026-09-13 — Fase 1 (en curso): fundación Supabase en frontend + hardening

**Contexto:** con Fase 0 cerrada y GitHub como historia autoritativa, Johann
entregó un to-do maestro de 17 secciones para organizar el trabajo restante.
Una auditoría completa del frontend (`index.html`, `js/app.js`) confirmó que
la app seguía siendo 100% prototipo `localStorage` — el cliente Supabase
nunca se instanciaba a pesar de cargar el SDK — con varios hoyos de
seguridad reales (credenciales de staff en texto plano en la página, rol de
usuario confiado desde `localStorage` editable). Fase 1 ataca esa fundación
sin tocar la boletería de Showman, que permanece oculta hasta tener venue.

**Hecho en esta fase (hasta ahora):**
- **Paso 1:** creado `js/config.js` (URL + publishable key, público por
  diseño, commiteado) e instanciado el cliente Supabase real en `js/app.js`,
  reemplazando el stub comentado. Sin cambio de comportamiento todavía.
- **Paso 2 — migración `0016_security_hardening.sql`** (aplicada tras
  aprobación explícita de Johann, verificada con `get_advisors` antes/
  después): corrige los Hallazgos **#6** (`approve_order`/`reject_order`
  ahora autorizan con `is_admin()`, no `is_staff()`) y **#7/#8** (revocado
  `EXECUTE` de `PUBLIC` sobre esas dos funciones y sobre los triggers de
  validación de precio de `0014`). Hallazgos #3 y #4 quedaron documentados
  sin cambio de SQL (decisiones ya tomadas: código muerto inofensivo y
  grant a `anon` intencional, respectivamente).
- **Pasos 3+4 — Auth real + rol server-trusted:** `AuthService` reescrito
  contra `sb.auth` (`signUp`/`signInWithPassword`/`signOut`/`updateUser`/
  `resend`/`getSession`/`onAuthStateChange`); verificación de correo por
  enlace en vez de código. El rol ya no se lee de `localStorage` — se lee
  siempre de `profiles.rol` vía `fetchProfile()` tras cada login/restauración
  de sesión.
- **Paso 5:** eliminado el recuadro de credenciales demo en `index.html` y
  la función `seedDemoUsers` (ya sin uso desde el rewrite de Auth).
- **Paso 6 — Google OAuth:** `loginGoogle()` ahora llama
  `sb.auth.signInWithOAuth({provider:'google'})`; provider configurado por
  Johann en el dashboard de Supabase.
- **Paso 7 — catálogo desde Supabase (con seed aprobado):** `DB.getProductions`/
  `getProduction` ahora leen de la tabla `productions` vía
  `sb.from('productions').select()` (antes: objeto hardcodeado en
  `js/app.js`). Insertadas las 3 filas reales tras aprobación explícita de
  Johann: Showman ($250, venue por confirmar, `on_sale=false`), Mamma Mia!
  ($150, Teatro UVM Juriquilla, `on_sale=false`), High School Musical ($50,
  Teatro Universidad Humanitas Querétaro, `on_sale=false`). No se tocó
  `seats`/`price_categories`/`performance_price_categories` — siguen vacías.
- **Paso 8 — panel staff: buzón de contacto + vendedores:** `DB` swap
  completo de `contact_messages` y `sellers` de `localStorage` a Supabase.
  Formulario público de contacto → `INSERT` (RLS pública); buzón del panel
  staff → `SELECT` (RLS staff); eliminar mensaje → `DELETE` (RLS admin-only).
  Alta de vendedor → `INSERT` en `sellers` (RLS admin-only, un `staff` sin
  rol admin verá el error de RLS al intentarlo — comportamiento esperado,
  no una regresión). Ambas cachés se recargan al abrir el panel staff (sin
  Realtime todavía, como estaba previsto para Fase 1).
- **Paso 9 — confirmar boletería de Showman oculta:** verificación (sin
  cambio de código): `currentOnSaleProduction()` depende de
  `productions.on_sale` (Supabase, `false` en la fila real; el único camino
  de escritura, `toggleShowmanOnSale`, está protegido por
  `productions_admin_write`, admin-only). `renderShowmanBanner` solo crea el
  botón "Comprar Boletos" cuando hay producción en venta; `renderCheckout`
  oculta el mapa de asientos y muestra el aviso "aún no están a la venta"
  cuando no la hay; `proceedToPayment` retorna de inmediato si no hay
  producción en venta. Ninguna ruta de UI llega al mapa de asientos ni al
  pago mientras `on_sale=false`. `seats`/`price_categories`/
  `performance_price_categories` confirmadas en 0 filas. **Fase 1 completa.**

## 2026-10-05 — Mapa interactivo de staff (0021)

**Qué:** el Boletaje del panel de staff muestra el mapa real de 725 asientos de
Showman por función. Admin: bloquear, liberar (también asientos vendidos, con
confirmación), generar boleto y cancelar. Staff: ver el mapa y validar QR.

**Base de datos (migración 0021, aplicada como `seat_map_rpcs`):** `seats.lado`
(poblado desde los cortes por fila) y tres RPCs `security definer` con el rol
validado dentro: `admin_create_seated_order` (no depende de `on_sale`),
`admin_cancel_ticket` y `check_in_ticket(text)`. Validada antes de aplicar con una
transacción que simula anon/fan/staff/admin y termina en rollback
(`supabase/tests/0021_seat_map_rpcs_test.sql`).

**Frontend:** el check-in pasa de `localStorage` a la RPC. Se retiró el mapa
prototipo 6×8 y su código (`localStorage`), incluido el botón "Simular Escaneo".
La gestión de Vendedores (que quedó inalcanzable al deshabilitar el Boletaje
prototipo) se restauró en un bloque bajo el mapa. `DB.createPerformance` ya no exige
fecha (coherente con 0019).

**Fuera de alcance / pendiente:** checkout público, tiempo real, boleto visual
(QR dibujado/PDF/Wallet), códigos de descuento.

## 2026-10-05 — Mapa de Showman y pendientes futuros

**Decisiones de Johann (Teatro de la Ciudad):** zonas Roja/Exclusivo (50, $400), Azul/VIP (200, $350), Rosa/Preferente (469,
$300) y Marrón/Discapacitados ($300, solo 6 espacios habilitados de los 10 de
la fila J). No existen la zona Naranja/Especial (filas Y–DD) ni General.
Migraciones `0018` (categorías + 725 asientos), `0019` (funciones con fecha por
definir) y `0020` (venue, 2 funciones y precios) preparadas, **no ejecutadas**.

**Pendiente futuro (sin número asignado):** capacidad por categoría para
boletos sin asiento (admisión general). Hoy no hace falta: Showman no vende
General. Se retoma cuando una producción lo necesite.

## 2026-10-05 — Auth en producción + responsive

**Contexto:** Johann probó el sitio publicado: la cuenta nueva no aparecía en
Supabase y una contraseña incorrecta daba acceso. Causa verificada: Vercel
seguía sirviendo el prototipo `localStorage` (los commits de Fase 1 y 2 no
estaban en `origin/main`). Tras el push (`f50409f..12d61b2`), el registro real
quedó verificado por Johann: usuario en `auth.users`, fila en `profiles` por el
trigger `handle_new_user`, confirmación por enlace y sesión iniciada. El primer
admin se promovió con un `UPDATE profiles` aprobado explícitamente, y la
sección "Gestión de Producciones" (Fase 2) funcionó con esa cuenta.

**Hecho:**
- **Auth:** `signUp`/`resend` pasan `emailRedirectTo` (el enlace vuelve al
  sitio); se detecta correo ya registrado (`identities` vacío) y el caso de
  sesión directa si "Confirm email" estuviera desactivado.
- **Responsive (sin verificar en navegador real):** navbar pasa a hamburguesa
  bajo 1180px (antes 680px: con 4 enlaces + 4 botones de staff los botones se
  cortaban); `#navAuth` con `flex-wrap`/`gap`; el toggle del submenú en JS usa
  la misma media query; `calc()` inválido del aviso flotante corregido;
  `100svh` para hero y login; chat y tarjeta de login fluidos; breakpoint de
  480px; inputs a 16px bajo 768px (evita zoom de iOS).

**Pendiente de Johann:** Google OAuth (lo está arreglando), y revisar el
responsive en dispositivos reales a 320/375/768/1024/1280px.

**Decisiones de Johann que enmarcan Fase 1:**
- Compra invitado-primero, cuentas demo eliminadas por completo, 3 roles
  con panel diferenciado, config vía `js/config.js` commiteado, verificación
  de correo por enlace (no código), primer admin por promoción manual
  aprobada explícitamente.

## 2026-09-13 — Fase 2: gestión admin de producciones y funciones

**Contexto:** con Fase 1 cerrada, Fase 2 conecta el resto del catálogo al
panel administrativo — crear/editar producciones y sus funciones
(`performances`), sin depender todavía del venue real de Showman (crear una
función no requiere numeración de asientos).

**Hecho en esta fase (hasta ahora):**
- **`DB` (js/app.js):** `createProduction`/`updateProduction` (INSERT/UPDATE
  contra `productions`, protegidos por `productions_admin_write`); cache +
  `loadPerformances`/`getPerformances`/`getPerformancesForProduction` +
  `createPerformance`/`updatePerformance` (contra `performances`, protegidos
  por `performances_admin_write`) — ambas policies ya existían desde `0010`,
  sin migración nueva.
- **UI:** nueva sección "Gestión de Producciones" en el panel staff
  (`index.html` `#admProdSec`), oculta client-side salvo `rol==='admin'` (RLS
  es la autoridad real). Edición inline de producciones existentes y de sus
  funciones; formularios para crear una producción nueva y agregar funciones
  a una producción existente.
- **Fuera de alcance de esta ronda, por decisión de Johann:** sin borrado (de
  producciones ni de funciones) — cualquier corrección se hace vía SQL
  aprobado, como en fases anteriores; sin página pública de marketing para
  producciones creadas desde el panel — el diseño de esa plantilla se hace
  cuando exista una producción real que la necesite.

## 2026-09-13 — Fase 0: coherencia repo↔DB + documentación

**Contexto:** el esquema Supabase (`0001`–`0015`) ya había sido diseñado,
ejecutado y verificado contra el proyecto real en sesiones anteriores, pero
GitHub no lo reflejaba completo: `0009`/`0010` tenían cambios sin commitear y
`0011`–`0015` nunca se habían commiteado (existían solo en disco). Esto
rompía la regla de que la base de datos debe ser reconstruible únicamente
desde el historial del repositorio.

**Hecho en esta fase:**
- Commiteado el esquema ejecutado a GitHub, en 5 commits separados por tema
  (grants/revokes 0009-0010; RPCs de ticketing + `unit_price` 0011; gestión
  manual de órdenes 0012-0013; categorías de precio 0014; reserva de
  asientos concurrency-safe 0015). Barrido de secretos antes de cada commit
  — cero hallazgos.
- Descubierto y decidido el **Hallazgo #6**: `approve_order()`/
  `reject_order()` (0013) autorizan con `is_staff()`, contradiciendo la
  política `orders_admin_write` (admin-only) y la matriz de permisos
  documentada. Decisión: admin-only es la regla correcta; corregir en una
  futura `0016` (no se edita `0013` retroactivamente). Hasta entonces, staff
  conserva esta capacidad en la práctica — riesgo conocido y documentado.
- Actualizado `supabase/docs/DESIGN.md` a v5: modelo de precios
  (`price_categories`/`performance_price_categories`), `tickets.unit_price`
  como snapshot histórico, las RPCs de venta/gestión ya implementadas, y los
  Hallazgos #3/#4/#6 como deuda técnica documentada (no corregida
  retroactivamente).
- Creados `docs/ARCHITECTURE.md` y `docs/DATABASE.md` (este documento y sus
  hermanos) como documentación viva del sistema completo.

**Decisiones de producto confirmadas en esta fase:**
- **Venta de boletos EN PAUSA.** Showman venderá boletos numerados pero
  queda como esqueleto hasta tener el venue real y su mapa de asientos. No
  se inventan asientos ni precios de relleno. Producciones futuras elegirán,
  cada una, admisión general o asiento numerado — ese flag por producción
  no existe todavía como columna.
- **Invitado primero.** Cuando se reactive la venta, la primera integración
  de compra será invitado (nombre + teléfono → WhatsApp), no login. Supabase
  Auth (email + Google) es una fase posterior.
- **Fase 0 antes que frontend.** Coherencia repo↔DB y documentación se
  resuelven antes de tocar `index.html`/`js/app.js`/`css/styles.css` o
  cablear cualquier cliente Supabase.

**No se tocó en esta fase:** ningún archivo de frontend, ninguna
migración histórica (`0001`–`0015` permanecen exactamente como fueron
ejecutadas contra Supabase), ningún dato en Supabase (no se ejecutó SQL
alguno contra la instancia real durante esta fase — todo el trabajo fue
`git`/documentación local).

## Antes de esta fase (resumen retroactivo, sin fecha exacta registrada)

- Diseño y ejecución del esquema base: enums de 3 roles, `productions`,
  capa `performances` (una producción puede tener varias funciones),
  `seats`, `profiles` con alta automática, `sellers`/`contact_messages`,
  `orders`/`tickets` con índice anti-doble-reserva compuesto
  `(performance_id, seat_id)`, `blocked_seats` con llave compuesta.
- Endurecimiento de la matriz de permisos: `staff` pasó de "operar" a
  "solo lectura interna + excepciones puntuales vía RPC angosta"; `admin`
  quedó como único rol con escritura real sobre catálogo/boletería/roles.
- Hallazgo de seguridad real y corregido: la policy original de
  `contact_messages` permitía a staff reescribir cualquier columna al
  "marcar como leído" — reemplazada por `mark_contact_message_read()`, una
  RPC `SECURITY DEFINER` que solo toca `leido`. Este patrón (RPC angosta en
  vez de `UPDATE` en bloque) quedó documentado como el estándar a seguir
  para cualquier escritura futura de staff (p. ej. check-in por QR).
