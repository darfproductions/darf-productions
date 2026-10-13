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
| Ajustes de marca | Fan Zone al final del menú, logo original (DARF con PRODUCTIONS abajo), destacada también en la cartelera, logos de DARF y de la obra en los boletos. |

## Lo que queda pendiente

- **Boletín por correo** (después; necesita suscripción, confirmación y baja).
- **Wallet** (Apple/Google): falta la cuenta de Apple Developer.
- **Avisos por WhatsApp**: es un servicio de pago.
- **Foto grupal en Nosotros**: cuando haya foto.
- **Tema claro del panel "DARF Admin"**: sin decidir; el panel sigue oscuro.
- No se harán: lista de espera, etiquetas de función (la franja ya cubre eso), transferir boleto, pago con tarjeta u OXXO.

## Para el lanzamiento (lista de revisión)

- **Entrar con Google:** en el proyecto de Supabase (DEV y luego el oficial) → Authentication → Providers → Google, con el Client ID y secreto de la 1.0, y agregar la dirección del sitio (`…/auth/callback`) en Google Cloud y en Supabase → URL Configuration. Probar el botón en DEV y otra vez el día de la publicación.
- Correr en DEV los scripts `supabase/dev/apply_0074_dev.sql`, `apply_0075_dev.sql`, `apply_0076_dev.sql`, `apply_0077_dev.sql`, `apply_0078_dev.sql`, `apply_0079_dev.sql`, `apply_0080_dev.sql`, `apply_0081_dev.sql` y `apply_0082_dev.sql` (en ese orden). La 0073 ya se aplicó.

## Cómo se verificó
- Copia local simulada (base local, PostgREST y la web en modo DEV), con funciones de prueba
  solo en la base local para ver los tres estados de venta.
- Capturas en celular (390 px) y computadora (1440 px) de cada pantalla; desborde horizontal 0.
- Prueba de punta a punta del rediseño (19 pasos, todos bien): filtros del inicio y la cartelera,
  menú de celular, estados de funciones, barra de compra, compra sin sesión pide entrar, DARFY
  (burbuja y pie), entrar, apartar un asiento, Mi cuenta, Fan Zone, aprobar la orden en el panel,
  boleto aprobado y salir.
- `tsc`, `eslint`, `vitest` y `next build`.
