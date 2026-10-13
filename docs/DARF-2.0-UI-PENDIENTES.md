# DARF 2.0 — Nueva UI: lo que se hizo y lo que falta

Estado: **piel nueva aplicada en DEV** (2026-10-12, rama `darf-2.0`).

Fuentes:
- Kit de Marca v1.0 y Manual de Marca (colores exactos, logos SVG, línea Oro de la Fan Zone).
- Guía de implementación de la nueva UI y propuesta visual **Fusión**
  (https://claude.ai/artifact/89yaHeH6jcM2apLpaQbSdC).

Regla del bloque: **cambiar la piel, no las funciones.** No hubo migraciones ni cambios de
rutas, acciones o permisos. Lo que la propuesta muestra y todavía no existe se anota aquí y
**no se muestra** en la web hasta que funcione (nada de botones que no hacen nada).

## Lo que se hizo

| Fase | Qué cambió |
|---|---|
| F0 · Base | Logos e íconos del kit en `web/public/marca/`; ícono del sitio y de la app desde el favicon del kit; tokens con los colores exactos (Sala #0B0910, Telón #17121F, Índigo #340FEB, Ciruela #830886, Carmín #D20122, Pulso #FF2D87, Lila #A48BFF, Oro #D7BB5F…); botones en píldora (`fb-*`), chips, estados, tarjetas de 22 px, vidrio, haces, cono y grano; el panel toma colores, letra y botones nuevos sin cambiar su acomodo. |
| F1 · Marco | Barra "Jóvenes para jóvenes"; encabezado de vidrio con logo del kit y punto dorado en la sección activa; menú de celular a pantalla completa (Esc, cierra al navegar, guarda el foco); pie nuevo; DARFY en píldora de vidrio y se abre desde el pie. |
| F2 · Inicio | Hero en dos columnas con avatares del equipo y la obra destacada; manifiesto "Jóvenes para jóvenes"; producciones 2 x 2 con filtros; Fan Zone en oro y Audiciones en luz; Nosotros. |
| F3 · Obra | Hero de 780 px con próxima función y "Boletos desde"; subnavegación fija; funciones con estado **Disponible / Últimos lugares / Agotado** (lectura de cupo que ya existía; "Últimos lugares" = 10 % o menos, en `lib/disponibilidad.ts`); zonas con su color y "Ver mapa del teatro"; ficha fija y tarjeta Fan Zone; elenco 3:4, equipos con aro dorado, galería en mosaico; barra fija de compra en celular. Funciona con obras de fondo claro y oscuro. |
| F4 · Cartelera | "En escena" con filtros, obra en cartelera panorámica, Próximamente en tarjetas horizontales y el **Archivo** (antes no aparecía en la cartelera). `/producciones` con la misma tarjeta. |
| F5 · Resto | Fan Zone en el mundo Oro (sin luz DARF ni Pulso); textos de éxito y aviso con los tokens del kit; tarjetas del inicio del panel legibles. Mi cuenta, compra, audiciones, contacto, entrar y legales ya toman la piel por los tokens. |

## Funciones de la propuesta: lo que ya se hizo (2026-10-12)

Diego eligió cuáles sí (ver plan del bloque). Hechas en `darf-2.0`, migraciones 0073–0082:

| Función | Dónde |
|---|---|
| Cuenta regresiva al estreno | Hero de la obra y obra destacada del inicio (`CuentaRegresiva`). |
| Franja de avisos del sitio | Abajo del hero del inicio; Panel → Ajustes → Sitio (0074). |
| Anuncios (elenco, convocatoria, fechas, nueva función, preventa, general) | Inicio, obra y Fan Zone; con revelación por fecha, "Avísame" y "solo Club Fan" (0074). |
| Compartir la obra | Botón en el hero de la obra. |
| Idioma en la ficha | Panel → Página pública → Datos y ficha (0073). |
| Cifras en Nosotros | `public_stats()` (0073). La foto grupal no se muestra hasta que exista. |
| Club Fan | Número de socio, credencial y "Fan fundador" (#1–#100) (0075). |
| Fan Zone interactiva | Pestañas Ensayos / Making of / Fotos / Más, contenido que se desbloquea por fecha, foto con el elenco (0075). |
| Preventa Fan Zone | Por función ("Preventa Fan Zone hasta"), regla en la base, "Activar recordatorio" (0076). |
| Pasos de compra 1–4 | `/comprar` (sin cargo por servicio; pago por transferencia y WhatsApp). |
| Transacciones y eventos asistidos | `/cuenta/transacciones` y `/cuenta/eventos`. |
| Eliminar mi cuenta | `/cuenta/eliminar` (0077). |
| Entrar con Google | Botón en `/entrar`. **Requiere activar Google en Supabase** (ver abajo). |
| Fan Zone con doble filtro | Obra + tipo de contenido se combinan (`/fan-zone/<obra>?cat=ensayo`), con "Mostrando" y × para quitar cada filtro. |
| Espaciado del panel | Margen arriba en todo el panel (`app/panel/layout.tsx`); revisadas 46 rutas, ninguna queda pegada. |
| Gafete digital | Mi cuenta → "Mi gafete" (equipo y elencos): QR + código DRF-XXXX, PDF, "Qué compartir"; página pública `/g/<token>` con "Guardar contacto"; panel → ensayo → "Checar con gafete" (presente/retardo según la tolerancia de la obra) (0078). |
| Pagos con recibo | Folio por año (DARF-2026-0001), anular en lugar de borrar (borrar solo 10 min), aviso al integrante, recordatorios (3 días antes y al día siguiente del límite), recibo y estado de cuenta en PDF, "Enviar por WhatsApp", pestaña Adeudos y exportar CSV (0079). |
| Gafete con jerarquía | El puesto más alto y sin obra: primero el cargo en DARF (Equipo DARF, p. ej. "CEO"), luego el rol de obra; elenco = "Elenco"; abajo "DARF Productions · año" (0080). |
| Credencial Club Fan con QR | Gafete dorado con logo Fan Zone, sello, número de socio, QR y código FAN-XXXX (PDF); verificación pública `/f/<token>` sin contacto (0080). |
| Eventos del Club Fan | Foto con el elenco o evento exclusivo (con o sin registro y boleto); en la entrada se escanea la credencial desde Fan Zone o Puerta y se marca la llegada (0080). |
| Eventos | Panel → Eventos: por función (foto con el elenco, tour por backstage, early access), presenciales (ensayo abierto, meet & greet) y en línea (transmisión, lanzamiento, preventa; liga 15 min antes y durante). Acceso Club Fan, con cuenta o público; de una obra o de DARF. Aviso al publicarse y recordatorio una hora antes; página pública `/eventos` (0081). |
| Eventos en portada y menú | "Eventos" en la barra de arriba (y en el menú del celular y el pie); sección "Próximos eventos" en la portada debajo de Producciones con el más cercano destacado; en `/eventos` los del club o con cuenta salen con candado para invitar a entrar o unirse (0082). |
| Menú compacto | Cartelera se unió con Producciones (`/cartelera` redirige con su filtro); "Panel" y "Mi cuenta" pasan a un botón de cuenta con menú (Mi cuenta, Mis boletos, credencial, Panel, Cerrar sesión). En celular sigue la hamburguesa (la app tendrá su propio menú). |
| Eventos en la obra | Sección "Eventos" en la página de cada obra (abiertos y con candado). |
| Credencial única | Una sola credencial y un solo QR por persona, según su nivel más alto: gafete (equipo y elencos) > dorada (Club Fan) > básica (cuenta). Si alguien del equipo es socio, su gafete lleva el sello del club y "Socio #NNNN"; si un fan entra al equipo, conserva su número, sus eventos y sus lugares. Los códigos viejos (FAN-XXXX, `/f/…`) siguen sirviendo. El equipo y los elencos cuentan como socios (0083). |
| Eventos con costo | Precio y precio para socios (vacío = gratis). Al apartar se crea un pedido EV-XXXXXX que vence como los boletos; se paga por WhatsApp o transferencia y se aprueba en Panel → Eventos ("Ver lista"). Sin pago aprobado, la entrada no deja pasar. Cupo de los primeros N o sin límite. "Mis eventos" en Mi cuenta (0083). |
| Equipo de cada evento | En Panel → Eventos, cada evento tiene "Equipo del evento": quien lo edita agrega personas por su correo con un papel (Organiza: abre/cierra registro, valida y aprueba pagos; Puerta: valida y marca llegadas; Cobros: aprueba o rechaza pagos). Vale solo para ese evento, también en los de DARF sin obra; esas personas ven en su panel solo sus eventos. Puerta y Taquilla de la obra también ven "Eventos" (0084). |
| Panel más fácil | **Por hacer** en Inicio: todo lo pendiente de tus obras (boletos y pagos de eventos por aprobar, solicitudes, documentos subidos, adeudos vencidos, requiere decisión, ofertas, audiciones) agrupado por obra, cada renglón directo a la acción, y **Hoy** con botones de Puerta/Taquilla. Número de pendientes en el menú y en las pestañas. **Pestañas de la obra en 6 grupos** (Resumen, Personas, Ensayos y equipo, Boletos, Público, Más) con la activa marcada. **Buscador** (Ctrl/⌘+K): obra + sección, personas, órdenes DARF-/EV-, convocatorias y eventos. **Configuración plegada** en Expedientes, Ensayos, Funciones, Página pública y Convocatoria (0085). |
| Contraseñas seguras | Ver/ocultar contraseña en todos los campos; contraseñas comunes o con el correo, rechazadas; el enlace de "olvidé mi contraseña" solo vale para esa cuenta, 15 minutos y una vez; al cambiarla se cierran las demás sesiones; crear cuenta ya no revela si un correo está registrado. Fotos comprimidas en el navegador antes de subir (ej. 9.6 MB → 47 KB). |
| Ventas más seguras | No se venden funciones que ya pasaron (en línea; taquilla hasta 3 h después de empezar y nunca en obras concluidas); Taquilla abre en la función de hoy. Aprobar pide cómo pagó (efectivo, transferencia, tarjeta…) y referencia; rechazar y cancelar piden motivo, que ve el comprador. "Cancelar un boleto" y "Cancelar orden" (su precio se descuenta de los ingresos), "Dar 24 h más" o "Reactivar 24 h" a un apartado vencido si sus lugares siguen libres, y quién aprobó, vendió o canceló. El comprador puede cancelar su apartado en Mi cuenta. Todo queda en la bitácora sin datos del comprador, igual que los cambios de precio y de códigos (0088). |
| Eventos editables | "Editar o cancelar" en cada evento: fecha, lugar, liga, cupo y precio (quien ya pagó conserva su precio). Un evento con pagos o apartados no se borra: se cancela con motivo, se avisa a los registrados y a quien pagó se le indica que se le reembolsará; en Mis eventos sale "Evento cancelado" (0088). |
| Privacidad de retratos | La página de la obra ya no muestra el retrato del perfil profesional si la persona no lo hizo público (incluye menores sin autorización) (0088). |
| Listo para compartir | Al pegar la liga de una obra en WhatsApp o redes sale su imagen de ambiente con "Boletos en darfproductions.com" y su descripción; imagen general de DARF para las demás páginas; mapa del sitio y reglas para buscadores (la copia DEV no se indexa). |
| Protecciones del navegador | La página no se puede meter dentro de otro sitio (evita clics engañados en el panel), siempre por conexión segura, y solo usa la cámara propia (Puerta). |
| Captcha (Turnstile) | Widget de Cloudflare en entrar, crear cuenta, recuperar contraseña, reenviar confirmación y cambiar contraseña; su token se pasa a Supabase. Mensajes claros si falla el captcha o hay demasiados intentos. **El captcha se prende en Supabase solo el día del lanzamiento** (ver abajo). |
| Comprar sin cuenta | El mapa se ve y se eligen asientos sin entrar; "Entrar para apartar" pide la cuenta y regresa con los mismos asientos. Términos y política de reembolsos junto al botón. |
| Cuentas | "Reenviar correo de confirmación"; Google cancelado ya no dice "enlace vencido" y se conserva a dónde ibas; correos de cuenta en español con enlace que sirve en cualquier navegador (`supabase/templates`). |
| Textos legales | Responsable (Diego Andrés Romero Fernández, nombre comercial DARF Productions) y domicilio; datos sensibles con consentimiento expreso (casilla en el expediente), proveedores fuera de México, cookies, plazos de conservación y ARCO en 20 días hábiles; reembolsos y apartados alineados con el sistema. |
| Errores en español | Un traductor único: los avisos de la base salen tal cual y los técnicos (red, sesión, permisos, archivos) en español, en compra, audiciones, Club Fan y Mi cuenta. Pantalla de error con código para soporte; indicador de "Cargando…". |
| Dirección oficial | Ligas de correos y QR impresos (programa, gafete) usan `darfproductions.com` en producción, no el dominio desde donde se abrió. WhatsApp mostrado desde la configuración; en producción debe ser 52 + 10 dígitos o la página no compila. |
| Ajustes de marca | Fan Zone al final del menú, logo original (DARF con PRODUCTIONS abajo), destacada también en la cartelera, logos de DARF y de la obra en los boletos. |
| Audiciones con votación | Cada obra tiene sus **personajes** en orden de importancia (Elenco y equipos) y la convocatoria los trae sola. Al crearla se elige si habrá **callback**; una barra de etapas con "Siguiente" lleva Audición → Elegir callback → Callback → Votación → Ajuste del cast → Enviado. Cada juez marca hasta **3 opciones** por persona (personaje o Ensamble); calificar del 1 al 5 queda opcional. **Votación secreta**: un voto por juez y por personaje o "Me abstengo", y quien gestiona ve "Votaron N de M". Al cerrar se arma la **propuesta** (quien gana varios se queda con el más importante, empates quedan todos, personaje vacío con pista de los más votados, Ensamble precargado); se ajusta arrastrando o con "Mover a…" y "Mandar ofertas y avisos" manda las ofertas (personaje o ensamble) y un aviso amable a quien no quedó. Convocatoria cerrada = liga + invitaciones por correo (con aviso a quien ya tiene cuenta). Las convocatorias sin personajes siguen igual (0089). |
| Pulido: fechas | Todo "hoy" en hora de México también en la página (mensualidades vencidas, cumpleaños, ensayos de hoy, mes de pago, edad): antes, de 6 p.m. a medianoche ya era "mañana". Fechas como "Viernes, 22 de noviembre" (no "Viernes, 22 De Noviembre") y sin "p.m.." (0090). |
| Pulido: acciones honestas | Elenco (papel, quitar, ordenar), Permisos (quitar rol), fotos de la Fan Zone, estado de la convocatoria, zonas, ensayos, logos, DARFY, roles y materias de maestros ya dicen por qué fallan en vez de "listo". Crear una convocatoria o un rol ya no queda a medias. |
| Pulido: permisos | El botón "Panel" sale solo a quien de verdad puede entrar. Sin ciclo de redirecciones en Boletos; Taquilla ve "Funciones y precios" (abrir/cerrar venta). Una obra concluida ya no abre por dirección boletería, ensayos, audiciones, materiales, comunicados, evaluaciones, programa ni puerta. El nombre en Elenco solo lleva a la ficha si se puede ver. "Cobrado en taller" solo para quien maneja mensualidades o publica la obra. Contacto avisa solo al Director (0090). |
| Pulido: sin topes | El buscador encuentra órdenes viejas (y sin escribir "DARF-"); Reportes cuenta todas las órdenes y pagos; mapas de más de 1,000 asientos completos y ocupados sin tope; "Copiar mapa" ve todas las obras (0090). |
| Pulido: base | Advertencias por mensualidades cada mañana (7:05) aunque nadie abra Expedientes; limpieza diaria (bitácora 24 meses, notificaciones leídas 90 días); la bitácora no guarda medidas, pagos ni incidencias, y se limpia al eliminar una cuenta; Contacto y DARFY sin repetidos; máximo 10 fotos por persona en una convocatoria abierta; "Por hacer" no pierde solicitudes al cerrar la convocatoria; índices (0090). |
| Pulido: detalles | Abrir una notificación la marca leída; Puerta dice a qué hora entró un boleto ya usado; números de asiento legibles en zonas claras; teléfono del comprador revisado; "Pregúntale a DARFY" en la compra lleva a Contacto; galería con descripciones; bitácora en español; sin ligas a páginas que no existen (obra en borrador, programa sin crear). Sesión y permisos se piden una sola vez por página. |
| Taquilla y órdenes (4A) | Cortesía en $0 con motivo (en taquilla o después, en la orden); códigos de descuento también en taquilla; PDF de los boletos de cualquier orden para reimprimir o mandar; buscar órdenes por nombre o teléfono; WhatsApp con un toque ("recordar pago" / "avisar que se aprobó"); pestaña **Corte de caja** por cajero y método, con lo cancelado aparte (0091). |
| Puerta (4A) | "Entraron X de Y" en vivo, sonido y vibración al leer, buscar por nombre/teléfono/código/asiento cuando el QR no abre, marcar o deshacer una entrada, y lista de la función para Excel como plan B sin internet (0091). |
| Funciones (4A) | "Cancelar función" con motivo: no se vende más, los apartados se cancelan, a quien pagó le llega el aviso de reembolso y el panel lista a quién devolver (con WhatsApp). Si cambia la fecha, se avisa a los compradores y el recordatorio se vuelve a mandar (0091). |
| Avisos personales (4B) | Al elenco: comunicado nuevo, ensayo nuevo (uno por serie), cancelado o cambiado. Al aspirante: convocado, en espera, callback, seleccionado o no (en audiciones sin votación; la votación ya avisa). Se pueden apagar por tipo ("Elenco", "Audiciones") en el teléfono (0092). |
| Para el público (4B) | "Hoy es tu función" arriba de Mi cuenta el día de la función (hora, cómo llegar, guarda tu PDF); "Agregar a mi calendario" (.ics y Google) en boletos, eventos y ensayos; "Voy a ir": imagen vertical para historias con la imagen de la obra, su logo y la fecha (sin datos personales ni QR). |
| Descargas para Excel (4B) | Órdenes (con los filtros de la lista, todas), inscritos de una convocatoria con sus respuestas, elenco con tutores y contactos de emergencia, y asistencia a ensayos. Cada una pide su permiso. |
| Póster oficial (0093) | Opcional (una obra puede anunciarse con sus audiciones sin póster). En Kit de marca: 3:4, 9:16, 4:3 y 16:9, cada uno "con toda la información" y "solo imagen"; revisa proporción y tamaño y lo guarda en JPG. Se usa: la versión con información al compartir la liga (16:9) y en la página de la obra (3:4); la limpia en la obra destacada (16:9 compu / 4:3 celular), tarjetas en celular (3:4), boleto y PDF (3:4 de fondo) y "Voy a ir" (9:16 limpio, o 3:4 limpio; nunca la versión con información: la imagen pone encima el logo de DARF, el de la obra, el texto y la función). Sin póster, todo sigue con la imagen de ambiente; en Producciones se marca "Sin póster destacado". |

## Lo que queda pendiente

- **Velocidad de páginas públicas (caché):** se dejó para después de la mudanza de datos (Bloque 5), cuando se mida con datos reales; ya se quitaron consultas repetidas de sesión y permisos.
- **Boletín por correo** (después; necesita suscripción, confirmación y baja).
- **Wallet** (Apple/Google): falta la cuenta de Apple Developer.
- **Avisos por WhatsApp**: es un servicio de pago.
- **Foto grupal en Nosotros**: cuando haya foto.
- **Tema claro del panel "DARF Admin"**: sin decidir; el panel sigue oscuro.
- No se harán: lista de espera, etiquetas de función (la franja ya cubre eso), transferir boleto, pago con tarjeta u OXXO.

## Para el lanzamiento (lista de revisión)

- **Entrar con Google:** en el proyecto de Supabase (DEV y luego el oficial) → Authentication → Providers → Google, con el Client ID y secreto de la 1.0, y agregar la dirección del sitio (`…/auth/callback`) en Google Cloud y en Supabase → URL Configuration. Probar el botón en DEV y otra vez el día de la publicación.
- DEV ya tiene aplicadas todas las migraciones hasta la 0091 (verificado; pendientes de correr en orden: `supabase/dev/apply_0092_dev.sql` y `supabase/dev/apply_0093_dev.sql`). El proyecto oficial necesitará las mismas, en orden, el día de la publicación.
- **Contraseñas (Supabase → Authentication → Providers → Email / Policies), en DEV y en el oficial:**
  - Largo mínimo **8** y "letras y números" (la página ya lo exige; así también lo exige Supabase si alguien llama directo a su servicio).
  - **"Secure password change"** encendido y **aviso por correo** cuando cambia la contraseña o el correo ("Password changed" / "Email changed" notifications).
  - **Protección contra contraseñas filtradas** (Leaked password protection) si el plan lo incluye.
  - **URL Configuration:** Site URL = el dominio oficial y en Redirect URLs solo `https://<dominio>/auth/callback` (y la de DEV en DEV). Así los enlaces de los correos no pueden mandar a otro sitio.
  - Revisar los límites de envío de correos (Rate limits) y que el correo de recuperación use la plantilla en español.

- **Captcha (Turnstile):** en Cloudflare → Turnstile → widget "DARF", agregar los dominios (`darfproductions.com`, `www.darfproductions.com` y el de DEV en Vercel). El día del lanzamiento, en Supabase → Authentication → Attack Protection: activar captcha con **Turnstile** y pegar la **Secret Key** (nunca en el repositorio). Antes de esa fecha no se prende.
- **Correo propio:** Supabase → Authentication → Emails → SMTP con Resend (`smtp.resend.com`, puerto 465, usuario `resend`, la API key como contraseña), remitente `no-reply@darfproductions.com`. Pegar las plantillas de `supabase/templates` (ver `LEEME.md`).
- **Aviso de Contacto:** la función `notify-contact` ya manda desde `no-reply@darfproductions.com` (se puede cambiar con el secreto `NOTIFY_FROM`); volver a publicarla.
- **Vercel producción:** `NEXT_PUBLIC_DARF_WHATSAPP` = 52 + 10 dígitos; opcional `NEXT_PUBLIC_SITE_URL` (por omisión `https://darfproductions.com`). En DEV puede definirse `NEXT_PUBLIC_TURNSTILE_SITE_KEY` vacía para quitar el widget.

## Cómo se verificó
- Copia local simulada (base local, PostgREST y la web en modo DEV), con funciones de prueba
  solo en la base local para ver los tres estados de venta.
- Capturas en celular (390 px) y computadora (1440 px) de cada pantalla; desborde horizontal 0.
- Prueba de punta a punta del rediseño (19 pasos, todos bien): filtros del inicio y la cartelera,
  menú de celular, estados de funciones, barra de compra, compra sin sesión pide entrar, DARFY
  (burbuja y pie), entrar, apartar un asiento, Mi cuenta, Fan Zone, aprobar la orden en el panel,
  boleto aprobado y salir.
- `tsc`, `eslint`, `vitest` y `next build`.
