# DARF 2.0 — Test maestro y análisis de calidad (2026-10-12)

Rama `darf-2.0`, commit `f8bfe19`. Prueba hecha en una **copia local simulada**:
- base con migraciones 0001–0067;
- PostgREST;
- gateway de cuentas y archivos con las mismas reglas RLS;
- web en modo producción.

DEV y producción no se tocaron. Las cuentas y los datos de prueba se borraron al terminar.

**Cobertura:**
- 13 perfiles;
- 9 escenarios de punta a punta (celular 390 px y escritorio 1440 px);
- barrido de 73 páginas por perfil (1,168 visitas);
- revisión de código con dos agentes (160 hallazgos);
- avisos de Supabase DEV, solo lectura.

**Resultado del barrido:**
- 0 errores 5xx;
- 0 excepciones de JavaScript;
- 0 imágenes rotas;
- 0 fugas de permisos.

**Calificación:**

| Pregunta | Nota |
|---|---|
| ¿Se ve bien? | 8/10 |
| ¿Navegación? | 7/10 |
| ¿Funciones? | 8.5/10 |
| ¿Lista para publicar? | 6/10 |

## Antes de publicar (críticos)

1. **Puerta acepta boletos de otra función** y los marca usados. Verificado: un boleto del 03/11 dio "✓ Puede pasar".
   - Dónde: `web/src/app/panel/producciones/[id]/puerta/DoorScanner.tsx`.
   - Dato disponible: `check_in_ticket` (0055) ya devuelve `performance_starts_at`.
   - Arreglo: elegir la función en Puerta, rechazar si no coincide y mostrar fecha y obra.
2. **Redirección abierta** en `safeNext` (`web/src/lib/auth.ts:44`). Verificado: `/entrar?next=/\sitio` lleva a otro dominio.
   - Arreglo: rechazar `\`, caracteres de control y `//`; resolver con `new URL(next, origin)` y exigir el mismo origen.
3. **Sin `not-found.tsx` ni `error.tsx`/`global-error.tsx`.** El 404 sale en inglés y sin marca.
   - Los accesos denegados del panel (por ejemplo, maestro, taquilla, puerta y staff en `/panel/audiciones/[aid]` y `/panel/talento/*`) muestran ese 404.
4. **Sin aviso de privacidad ni términos.**
   - Hoy se guardan datos de menores, salud, medidas y fotos.
   - `ApplyForm.tsx` pide consentimiento sin una página que lo respalde.
5. **Restos de DEV:**
   - el enlace "Panel anterior (1.0)" a `darf-2-dev…vercel.app` (`web/src/app/panel/layout.tsx:20`);
   - los textos "entorno de pruebas" y "sin número configurado" si falta `NEXT_PUBLIC_DARF_WHATSAPP`;
   - la 1.0 en la raíz (`index.html`, `js/config.js`) apunta a Supabase DEV. Fusionar a `main` la publicaría así. Se necesita Root Directory `web` y variables PROD.
6. **Desborde horizontal en celular** (verificado):

   | Página | Desborde |
   |---|---|
   | `/panel/producciones/nueva` | 138 px |
   | `/panel` | 20–132 px |
   | `/panel/personas` | 106 px |
   | `/contacto` | 37 px |
   | `/panel/producciones/[id]/elenco` | 23 px |
   | `/comprar/[funcion]` | 18 px |
   | taquilla | 18 px |
   | `/panel/audiciones/[aid]` | 17 px |
   | registro de audición | 9 px |

7. **Abuso:**
   - contacto y DARFY sin límite ni campo trampa; cada mensaje notifica a todo el staff;
   - sin captcha al registrarse;
   - contraseña mínima de 6 en Auth;
   - protección contra contraseñas filtradas apagada;
   - `push_test`, `push_subscribe` y `push_set_off` ejecutables por `anon`. Fallan sin sesión, pero conviene revocarlos.
8. **Vencimiento de órdenes sin programador** (0054): `expire_due_orders` solo corre al abrir páginas. Arreglo: `pg_cron` cada minuto.
9. **Totales de venta limitados a 500 órdenes** (`web/src/lib/boleteria.ts:65` → `summarizeSales`). Arreglo: sumar en SQL.
10. **"0 boletos" en Mi cuenta para órdenes pendientes.** Verificado: una orden de 3 asientos mostraba "0 boletos".

## Estado de los 10 críticos (resueltos en la rama `darf-2.0`, migración 0068)

| # | Pendiente | Cómo quedó |
|---|---|---|
| 1 | Puerta acepta boletos de otra función | Se elige la función; un boleto de otra se rechaza en rojo **sin gastarse**; todas las respuestas muestran obra y fecha. |
| 2 | Redirección abierta en `/entrar` | `safeNext` rechaza `\`, `//` y caracteres de control, y exige el mismo sitio (con pruebas). |
| 3 | 404 y errores en inglés | Páginas propias: no existe, algo salió mal, error general y "no tienes acceso" en el panel. |
| 4 | Sin aviso de privacidad ni términos | Borrador en `/privacidad`, `/terminos` y `/reembolsos`, con ligas en el pie, el registro y las audiciones. **Falta: razón social, domicilio y revisión legal.** |
| 5 | Restos de DEV | El enlace a la 1.0 solo aparece con `NEXT_PUBLIC_DARF_PANEL_1_URL`; los textos de "entorno de pruebas" se cambiaron por la liga a Contacto; la web falla al arrancar si es PROD y apunta a la base DEV. |
| 6 | Desborde en celular | Las rejillas sin columnas ya se encogen en celular (regla global) y se ajustaron Contacto, Nueva producción, Directorio, Elenco e Inicio. |
| 7 | Spam de contacto, DARFY y push | Límites en la base: 5 por correo por hora y 300 por hora en total; largos máximos; campo trampa; `push_*` sin acceso anónimo y la prueba de push solo para el equipo. |
| 8 | Vencimiento sin programador | `pg_cron` corre `expire_due_orders()` cada minuto; el mapa ya no escribe al sondear y no sondea con la pestaña oculta. |
| 9 | Totales mal después de 500 órdenes | Los totales de boletos y reportes los calcula la base (`production_sales_summary`). |
| 10 | "0 boletos" en órdenes pendientes | Mi cuenta muestra los asientos de la orden pendiente (sin QR). |

Lo que queda para el día del lanzamiento está en `DARF-2.0-PLAN.md` §9, punto 8.

## Importante (primer ajuste después)

- **Mapa en celular:**
  - abre en "Ajustar" con asientos de 12 px;
  - la barra fija (`z-30`) tapa las filas de abajo;
  - el rótulo "Escenario" se encima a la fila A.
- **Menú `<details>` del celular queda abierto al navegar.** Afecta al menú público y al del panel.
- **Avisos que no salen:**
  - `/entrar` no lee `?error=enlace`;
  - "Crear cuenta" pierde `next`.
- **`error.message` crudo:** más de 150 lugares, en compra, storage, cuenta, equipo y panel.
- **La portada no muestra "Desde $".** El precio vive en `performance_price_categories`.
- **"Hoy" con reloj UTC:** `panel-home-rules`, `account-rules`, `member-rules`, `cuenta/produccion`, `cumpleanos`.
- **Velocidad:**
  - sin React `cache()` (sesión y permisos unas 4 veces por página);
  - `SiteHeader` vuelve dinámicas todas las páginas públicas;
  - DARFY hace 10–20 consultas por pregunta.
- **SEO y compartir:** sin Open Graph, `metadataBase`, `robots` ni `sitemap`; los detalles de obra, audición, artista y programa solo tienen título.

## 1. Funciona perfecto (verificado)

- **Montaje de obra:**
  - crear y duplicar;
  - editor de página, kit, colores, canciones, videos y agradecimientos;
  - vista previa y publicar.
- **Mapa de asientos:** generador, zonas por filas, vista previa, reemplazo con confirmación y edición asiento por asiento.
- **Funciones y venta:**
  - precios por zona y entrada general con cupo;
  - interruptor de venta.
- **Compra:**
  - apartado de 24 h y límite de 3 pendientes;
  - descuento por zona exacto y código de vendedor precargado desde `?v=`;
  - WhatsApp completo;
  - asientos ocupados para otros.
- **Operación de venta:**
  - aprobar y rechazar con confirmación;
  - taquilla de asientos y entrada general;
  - estados de Puerta: válido, ya usado, sin aprobar e inválido.
- **Audición de punta a punta:**
  - plantilla, personajes, horarios y preguntas;
  - inscripción con foto en celular;
  - llegada, juez en celular, selección y oferta;
  - al aceptar, pasa a integrante.
- **Elenco:**
  - documentos y pagos (el campo "Último mes" es obligatorio);
  - ensayos, asistencia en celular y aviso de falta;
  - materiales con URL firmada, comunicados con lectura y expediente;
  - rúbrica del maestro.
- **Equipo:** nota urgente, atender con respuesta, material y notificaciones.
- **Cierre:** quedan 9 pestañas, el acceso por URL se redirige, la obra pasa a Archivo y se puede reactivar.
- **Cuentas:**
  - registro, confirmación y recuperación;
  - perfil profesional público enlazado desde la obra.
- **DARFY:** 6 de 6 preguntas bien contestadas, incluido el "no sé"; ofrece WhatsApp y formulario; guarda lo que no supo.
- **Permisos:** matriz de 13 perfiles × 73 páginas sin fugas.
- **App:** manifest y service worker registrados.

## 2. Qué se ve bien

- **La marca:** fondo oscuro de sala, degradado violeta a magenta, Montserrat en mayúsculas. Es reconocible en cada pantalla, pública y del panel.
- **Cada obra con su propio tema:** la página de la obra cambia de colores, logo y ambiente según su kit. Se siente como un sitio por producción.
- **Portada y cartelera:** jerarquía clara (cartelera, próximamente, archivo), tarjetas con etiquetas correctas y una obra destacada con botón de compra.
- **Puerta y estados:** verde, naranja y rojo grandes; se leen a un metro de distancia.
- **Mi producción del integrante:** resumen arriba (próximo ensayo, avisos, expediente, pagos) y secciones abajo. Es lo más claro de toda la plataforma.
- **Mapa de asientos y DARFY:** colores por zona, leyenda y una burbuja de asistente que se siente de la marca.

## 3. Qué se puede mejorar en funcionalidades

- **Puerta:** elegir la función al abrir, mostrar fecha, hora y obra en cada lectura, contador de entradas en vivo y modo sin internet.
- **Compra:** mostrar el número real de boletos en órdenes pendientes, permitir cancelar una orden propia, validar el código de vendedor al escribirlo (ya se hace en asientos, no en entrada general) y mostrar "Desde $" en portada y tarjetas.
- **Cuentas:** conservar a dónde iba la persona al crear cuenta, avisar cuando un enlace vence y permitir reenviar el correo de confirmación.
- **Panel:** ver página pública de una obra en borrador lleva a 404 (debería abrir la vista previa); "Ver programa" aparece aunque el programa no exista; el pendiente "ofertas" lleva a Audiciones en vez de Elenco.
- **Staff:** el staff puede usar Contacto y DARFY pero no los tiene en su menú; quien solo maneja descuentos o vendedores cae en un ciclo de redirecciones en Boletos.
- **Notificaciones:** una nota "de dirección" enviada por Producción dice "Nota URGENTE de dirección"; conviene decir quién la manda.
- **Bitácora:** traducir los registros técnicos ("insert en seller_productions") a frases.
- **Errores:** cambiar los mensajes crudos de la base por mensajes claros en español y revisar acciones que ignoran errores (por ejemplo, cancelar mi solicitud de audición no pide confirmación ni avisa si falla).
- **Datos grandes:** el Directorio corta a 100 a 300 personas, la bitácora a 150 y contacto a 200 sin paginación.

## 4. Qué se puede ver mejor

- **Desborde en celular** en 9 páginas (lista arriba).
- **Fechas:** salen como "Lunes, 2 De Noviembre, 6:00 P.M."; en español van en minúsculas: "lunes 2 de noviembre, 6:00 p.m.". También hay un punto doble en "mañana 2:04 a.m..".
- **Textos repetidos o con jerga:** "General · Pista · Pista", "1 permisos", "etapa 3E", "Callback", "Transcript", "Kit", "Crew".
- **Menús:** ninguno marca la sección activa; las 17 pestañas de una obra se cortan a la derecha sin indicar que hay más; el panel no tiene un título principal en las páginas de audición.
- **Burbuja de DARFY** grande en celular: tapa botones en Mi cuenta, Entrar y formularios. Mejor solo el ícono en celular, y ocultarla en el programa de mano.
- **Botones pequeños:** "Marcar leída", "Borrar", "×" de 20 px y ligas de solo texto quedan debajo de 24 px en celular.
- **Letra muy chica (10 a 11 px)** en datos importantes: pagos, asistencia y advertencias del integrante, boletos y tablas del panel.
- **Números de asiento** blancos sobre zonas claras (amarillo VIP) se leen mal.
- **Mi cuenta** en celular: ofertas e invitaciones (lo que pide acción) quedan después del perfil; falta un submenú.

## 5. Qué falta o puede faltar a largo plazo

- **Pago en línea** (Mercado Pago, Stripe o Conekta) para que la orden se apruebe sola, en lugar de WhatsApp y aprobación manual.
- **Correos automáticos:** confirmación de compra con boletos, recordatorio de pago antes de que venza, recordatorio un día antes de la función, aviso de audición y oferta de papel. Hoy los correos salen de una dirección de prueba de Resend que solo llega al dueño de la cuenta.
- **Políticas visibles:** privacidad, términos, reembolsos y cambios.
- **Medición:** analítica de visitas y conversión (cuántos ven la obra, cuántos compran), y monitoreo de errores en producción.
- **Exportar a Excel** ventas, elenco, asistencia y expedientes; facturación (CFDI) si se requiere.
- **Lista de espera** para funciones agotadas y reventa o cambio controlado de boletos.
- **Puerta sin internet** y contador de aforo en vivo.
- **DARFY con IA**, cuando apruebes la clave y el tope de gasto.
- **App en tiendas** y boletos en Apple/Google Wallet.
- **Encuesta después de la función** y reseñas.
- **Ayuda dentro del panel** para roles nuevos (taquilla, puerta, maestros): una guía corta por pantalla.
- **Respaldo y limpieza** automáticos: notificaciones, bitácora y mensajes crecen sin límite.
- **Pruebas automáticas** de los flujos principales (las de esta auditoría) en cada cambio.

## 6. Qué se puede hacer más eficiente

- **Guardar en memoria la sesión y los permisos** durante cada carga: hoy se piden unas 4 veces por página del panel.
- **Páginas públicas en caché:** el encabezado lee la sesión y vuelve dinámica toda la web pública; con una isla pequeña para "Mi cuenta/Panel", la cartelera y las obras se sirven al instante.
- **DARFY:** reutilizar la información pública por unos minutos en vez de 10 a 20 consultas por pregunta.
- **Consultas en paralelo** en Mi cuenta, Mi producción, Taquilla, Programa y Fan Zone, que hoy van una tras otra; generar los QR en paralelo.
- **Base de datos:** 86 llaves sin índice (por ejemplo boletos por asiento, solicitudes por persona), 51 reglas que recalculan al usuario en cada fila y 157 tablas con varias reglas que se evalúan juntas.
- **Sumas en la base** para ventas, reportes y contadores (Fan Zone, órdenes pendientes) en vez de descargar todas las filas.
- **Refrescos automáticos:** el mapa de compra consulta cada 20 s aun con la pestaña oculta; el registro de audición y la asistencia recargan la página completa cada 20 a 30 s.
- **Peso:** cada página baja unos 470 KB de JavaScript sin comprimir; Mi cuenta, 746 KB. Cargar DARFY y el generador de PDF solo cuando se usan.
- **Fotos de perfiles y galería** sin optimizar (27 imágenes fuera del optimizador).

## 7. Qué necesita ser más detallado

- **Preguntas frecuentes de DARFY:** son 15 genéricas; faltan respuestas reales sobre reembolsos, estacionamiento, accesibilidad, edad mínima por obra, formas de pago y facturas.
- **Políticas y textos legales** (privacidad de menores, uso de imagen, reembolsos).
- **Nosotros:** semblanzas y fotos del equipo; hoy depende de lo que se cargue.
- **Fan Zone:** lista obras sin contenido que llevan a una página vacía.
- **Estados vacíos:** varias listas no dicen nada cuando están vacías (portada sin obras, descuentos, avisos, reportes).
- **Comprobante de compra:** un recibo claro (qué compré, cuánto pagué, código) además del boleto.
- **Reportes:** hoy son tablas; faltan gráficas por día, por zona y por vendedor, y comparar funciones.
- **Descripción de permisos:** en Roles y permisos, explicar con ejemplos qué puede hacer cada rol.
- **Mensajes de confirmación** después de guardar en algunas pantallas del panel (por ejemplo, activar un vendedor o guardar datos de una audición no dejan un aviso claro).

## Matriz por perfil

| Perfil | Resultado |
|---|---|
| Visitante | Funciona. Detalles: 404 en inglés, menú abierto, desborde en Contacto |
| Usuario nuevo | Funciona. Detalle: enlace vencido sin aviso |
| Comprador | Funciona. Detalles: "0 boletos", mapa chico en celular |
| Vendedor | Funciona |
| Aspirante | Funciona |
| Integrante | Funciona |
| Maestro | Funciona |
| Taquilla | Funciona |
| Puerta | **Falla:** deja pasar boletos de otra función |
| Producción | Funciona |
| Dirección | Funciona |
| Staff | Funciona. Detalle: Contacto y DARFY no están en su menú |
| Director | Funciona. Detalles: tarjetas de "Mis producciones" recortadas, bitácora técnica |

## Detalles visuales y de texto (verificados)

- **Fechas:** en Title Case ("Lunes, 2 De Noviembre, 6:00 P.M."), por la clase `capitalize`.
- **Erratas y jerga:**
  - "a.m.." con punto doble;
  - "General · Pista · Pista";
  - "1 permisos";
  - bitácora con "insert en seller_productions";
  - "etapa 3E".
- **Tarjetas "Mis producciones"** del inicio del panel cortan el nombre a una letra.
- **Burbuja de DARFY** grande en celular; tapa botones.
- **Números blancos** sobre la zona amarilla (VIP) se leen mal.
- **Campos sin etiqueta:**

  | Página | Campos |
  |---|---|
  | `/panel/personas` | 78 |
  | elenco | 14 |
  | config. de audición | 11 |
  | página pública | 7 |
  | evaluaciones | 7 |

- **Objetivos táctiles menores a 24 px:** "Marcar leída", "Borrar", "×" y ligas de solo texto.
- **Páginas de audición del panel sin `h1`.**

## Rendimiento medido (copia local, no comparable con Vercel)

| Página | JavaScript sin comprimir | Imágenes |
|---|---|---|
| Promedio | ~470 KB | — |
| `/cuenta` | 746 KB (`ticket-canvas`, QR) | — |
| Portada | — | 1.3 MB (sin optimizar en la copia local; en Vercel se optimizan) |

## Apéndice técnico (revisión de código y avisos)

# Agente A (huecos, navegación, framework, copy, UX) — 78 hallazgos (alta 6 · media 31 · baja 41)
ALTAS: (14) sin aviso de privacidad/términos (ApplyForm pide consentimiento; expedientes con salud/menores); (15) bucle de redirección /boletos↔/boletos/funciones para roles solo descuentos/vendedores; (33) sin not-found.tsx (404 Next en inglés); (34) sin error.tsx/global-error.tsx; (64) Puerta: DoorScanner no muestra fecha/obra; boleto de otra función "Puede pasar" y se consume (check_in_ticket ya devuelve performance_starts_at).
MEDIAS: (3) contacto sin env.whatsapp muestra "En el entorno de pruebas…"; (4) OrderDone/cuenta "sin número configurado en este entorno"; (5) panel "Panel anterior (1.0)" URL DEV fija (panel/layout.tsx:20); (12) "Ver página pública" en borrador da 404 → vista-previa; (16) ventas.operar puede abrir/cerrar venta pero sin enlace "Funciones y precios"; (17) staff sin permisos ve "Panel" y requirePanel lo regresa a /cuenta; (19) /entrar no lee ?error=enlace; (20) Crear cuenta pierde `next`; (21) menús sin sección activa/aria-current (17 pestañas obra, boletería, audición, público); (28) /cuenta sin submenú; acciones pendientes (ofertas/invitaciones) al final en celular; (35) sin loading.tsx; (36) sin robots/sitemap; (37) sin metadataBase/openGraph/opengraph-image; (38) detalle obra/audición/artista/programa sin description/OG; (45-48) error.message crudo al público (compra, códigos, storage, audiciones, cuenta, perfil, expediente, equipo, notificaciones); (51) cancelar mi solicitud sin confirmar e ignora errores; (53) cancelar boleto general muestra "null" y "asiento queda libre"; (65) menús <details> quedan abiertos al navegar (móvil); (66) asientos hasta 12px con "Ajustar"; (67) botón × 20px destructivo; (68) text-[11px] en info importante (cuenta/produccion, TicketCard); (71) campos sin label (DarfyChat input, cuenta/equipo).
BAJAS: Soon muerto; contacto TRANSITORIO; jerga 1.0/"etapa 3E"; nosotros ignora error; ProductionView "se publicarán pronto" aunque haya elenco; fan-zone lista obras vacías; "Ver programa" sin crear da 404; staff sin menú para Contacto/DARFY; volver desde audición archivada rebota; pendiente "ofertas" lleva a audiciones; juntas sacan del panel; sin "← Todas" si no hay ficha; talento sin volver; notificaciones sin sección activa; cuenta/produccion menú sin Evaluaciones/Cumpleaños; sticky sin scroll-margin (#funciones tapado); vista-previa franja tapa barra; galería escondida en Fan Zone; títulos fijos (fan-zone, cuenta/produccion, comprar); home sin metadata; pestañas del panel sin nombre de obra; noindex solo en vista-previa; manifest orientation portrait; PDFs devuelven JSON crudo; >130 error.message en panel; "Asientos" en entrada general; Obra vs Producción; Comunicados vs Avisos; Órdenes/compras/solicitud; Callback/Transcript/Reel/Staff/Crew/Kit; reportes estado crudo; estados vacíos faltantes (home, producciones, fan-zone, avisos corta en 20, descuentos, reportes/obras, cuenta sin CTA); contacto sin honeypot; GeneralPicker no valida vendedor; liga FAQ sin validar; href="#" muertos; text-[10px] en panel; acciones solo texto; placeholders sin label en panel; artistas <a><img alt="">; galería alt=""; burbuja DARFY tapa botones en /cuenta,/entrar,formularios, visible en /programa; franja DEV tapa barra de compra; ConcludedGuard redirige en cliente; Perfil profesional <a> en vez de Link.
OK: hrefs/redirects válidos; sin anclas /# rotas; sin páginas huérfanas; tablas con overflow-x.

# Agente B (eficiencia, seguridad, BD, confiabilidad, publicación) — 82 hallazgos (alta 10 · media 38 · baja 34)
BIEN: RLS en todas las tablas; 228 SECURITY DEFINER con search_path; políticas públicas solo con funciones concedidas a anon; sin service key en web; NEXT_PUBLIC solo URL/llave pública/WhatsApp; sin dangerouslySetInnerHTML ni console; buckets con límites de tamaño/MIME; jsqr dinámico, qrcode solo servidor.
ALTAS: (1) sin React cache(): getSession/getPanelAccess/requirePanel se repiten por capa (~4x por página del panel); (2) SiteHeader lee cookies en el layout raíz → todas las páginas públicas dinámicas y sin caché; (5) boletos: listOrders dos veces + consulta extra de funciones; (13) cada pregunta a DARFY reconstruye todo el contexto (10–20 consultas) sin caché; (31) REDIRECCIÓN ABIERTA: safeNext acepta "/\evil.com" y "/\t/evil.com" → new URL los resuelve a https://evil.com (entrar/page.tsx, entrar/actions.ts, auth/callback); (32) spam de contacto: insert anónimo check(true), sin límite de largo en BD, sin honeypot/límite, cada mensaje notifica a todo el staff + push + correo Resend; (33) DARFY público sin límite de tasa; tope global 300/h llenable por uno; (59) boleteria limit(500) → totales de ventas/ingresos silenciosamente mal pasadas 500 órdenes (boletos y reportes); (71) enlace fijo al panel 1.0 de DEV; (72) el 1.0 en la raíz (index.html, js/config.js) apunta a Supabase DEV con franja DEV en esta rama: fusionar darf-2.0 a main publicaría la 1.0 contra DEV → Root Directory=web en producción o quitar 1.0.
MEDIAS: getUser() a red varias veces por request (usar getClaims); my_panel_access del Director = obras×permisos en cada render; expire_due_orders (escritura) en cada render/polling → pg_cron; SeatPicker sondea cada 20s aun en pestaña oculta; /cuenta cadena secuencial + QR uno por uno; cuenta/produccion 5 rondas + N+1; panel inicio cumpleaños N+1; TeamManager lectura por aviso N+1; team.ts carga todo y firma todas las URLs; generateMetadata duplica consultas; página pública ~17 consultas sin caché; taquilla secuencial; panel-data baja 1000 órdenes para contar; panel-auditions select * filtrando en JS; solicitudes sin límite (registro permanente crece); AutoRefresh 20–30s recarga ~15 consultas; login/registro/reset desde el servidor → límites de Supabase por IP de Vercel, sin captcha; contraseña mínima 6 en Auth (app pide 8); enlaces de correo con Origin del request (usar SITE_URL + lista permitida); acaparar asientos con cuentas ilimitadas; push_test sin límite para cualquiera; índices faltantes: tickets(seat_id), blocked_seats(seat_id), audition_applications(user_id), audition_roles/slots/fields(audition_id), rubric_*(production_id); RLS con auth.uid() sin (select …) y has_perm por fila en orders/tickets; notify_config por fila de audit_log (cambios masivos = N notificaciones + N pg_net); sin programador de vencimiento (asientos retenidos hasta que alguien abre una página); acciones que ignoran errores (elenco, permisos, cancelar solicitud, marcar leído, expediente, evaluaciones, darfy, storage remove); UPDATE/DELETE sin count → "éxito" con 0 filas; escrituras multi-paso no atómicas (roles, audición+campos, precios+función, evaluaciones); .in() con cientos de UUID → URL larga falla en silencio; "hoy"/"este mes" con reloj UTC del servidor (mal después de las 18:00 CDMX: ensayos, cumpleaños, cuotas, ProfileForm hidratación); 4 formatos de dinero distintos ($1,234.00 MXN vs $1,234 redondeado); vercel.json inexistente, config de despliegue solo en el dashboard; CI/isolation con ref DEV fija y sin pruebas SQL; sin SITE_URL ni verificación de que PROD apunte a Supabase PROD.
BAJAS: waterfalls en programa/fan-zone/comprar; fanzoneCounts baja todo; getHomeData lee todas las funciones; bitácora 150/contacto 200 sin paginación; moveCredit uno por uno; inserts en bucle; storage list N+1; expedientes O(n²); DarfyChat en todas las páginas (incl. panel) sin carga diferida; ticket-canvas estático; proxy corre en sw.js/manifest; enumerar códigos de descuento/vendedor sin límite; push-send init sin secreto; href "//evil.com" pasa startsWith("/") en sw.js y notifications; push_subscribe reasigna endpoint; nombre de obra del WhatsApp viene del cliente; sin CSP/HSTS/frame-ancestors/nosniff, poweredByHeader activo; textos libres sin largo en audition_apply; foto huérfana si falla la solicitud; FKs sin índice (member_docs, program_sponsors, notifications(production_id), orders(seller_id)…); políticas permisivas múltiples en orders/tickets; notify_* traga errores; sin purga de notificaciones/bitácora/darfy/contacto; push_config en tabla plana (Vault); team_material_visible_for O(N²); loaders tragan errores como []; directorio cortado a 100/300; env darfEnv por omisión "DEV"; sin noindex en DEV; resend desde onboarding@resend.dev; 27 <img> sin optimizar (perfiles/gallery fuera de remotePatterns); apply_*_dev duplican migraciones.

# Supabase advisors (DEV, solo lectura)
SEGURIDAD: auth_leaked_password_protection (WARN: activar en prod); function_search_path_mutable 12 (darf_luminance, darf_contrast, production_kit_problems, productions_template_guard, protect_system_roles, audition_criterios_ok, unaccent_lower, seller_short_name, avatar_owner, pro_owner, team_href, team_path_production — helpers, riesgo bajo); anon_security_definer_function_executable 28 (mayoría públicas a propósito: get_taken_seats, general_availability, team_public, audition_is_public…; trigger fns no se pueden llamar; push_set_off/push_subscribe/push_test ejecutables por anon por los default privileges de Supabase — fallan sin sesión pero conviene revocar); authenticated 190 (diseño: cada función revisa permisos adentro); rls_enabled_no_policy push_config (intencional).
RENDIMIENTO: unindexed_foreign_keys 86; auth_rls_initplan 51 (auth.uid() sin (select …)); multiple_permissive_policies 157; unused_index 17 (DEV con pocos datos, no concluyente).
