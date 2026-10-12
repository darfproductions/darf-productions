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

## Funciones nuevas que muestra la propuesta (pendientes)

Ordenadas por pantalla de la propuesta. Para cada una: qué haría falta.

### Inicio y página de obra
- **Cuenta regresiva al estreno** (inicio y hero de la obra). Solo web: con la fecha de la primera función.
- **Franja de avisos general en el inicio** (hoy la franja es por obra, 0069). Necesita una franja "del sitio" en la base y en el panel.
- **Boletín por correo** (suscribirse en el pie). Tabla de suscriptores, confirmación por correo y baja.
- **"Comparte la obra"** (botón de compartir). Solo web.
- **Idioma en la ficha.** Se puede cargar hoy como "dato extra" de la ficha; si se quiere fijo, columna nueva.
- **Revelación del elenco con fecha** ("Se revela en…"). Columna de fecha en la obra y regla en la página.

### Funciones y boletos
- **Lista de espera en funciones agotadas.** Tabla de espera y aviso cuando se liberan lugares.
- **Preventa Fan Zone** (estado "Preventa" y "Entrar a preventa"). Fechas de preventa por función y regla de compra solo para cuentas de la Fan Zone.
- **Etiquetas de función** ("Estreno", "Función familiar"). Columna de etiqueta en funciones y campo en el panel.
- **Pasos de compra (1 a 4)** y **cargo por servicio** visible antes de pagar.
- **Pago con tarjeta y OXXO** (hoy: transferencia y aprobación en el panel). Requiere pasarela de pago.
- **"Avísame"** en obras próximas. Tabla de interesados y aviso cuando abra la venta.

### Fan Zone
- **Club Fan con número de socio y credencial**, y "Activar recordatorio".
- **Contenido que se desbloquea por fecha.** Fecha de publicación por contenido.
- **"Foto con el elenco"** (apartar lugar después de la función).

### Mi cuenta y acceso
- **Transacciones**, **eventos asistidos**, **Wallet** y **transferir boleto**.
- **Preferencias de notificación por correo y WhatsApp** (hoy: notificaciones en la web y en el teléfono).
- **Eliminar mi cuenta** (con lo que pide el aviso de privacidad).
- **Entrar con Google**, **verificación por código** y **"Recordarme"**.

### Nosotros
- **Cifras** (producciones, funciones, integrantes) y **foto grupal**.

### Panel
- **Tema claro "DARF Admin"** de la propuesta (resumen con gráficas, exportar CSV, bandeja de mensajes). Decisión de este bloque: el panel se queda oscuro.

## Cómo se verificó
- Copia local simulada (base local, PostgREST y la web en modo DEV), con funciones de prueba
  solo en la base local para ver los tres estados de venta.
- Capturas en celular (390 px) y computadora (1440 px) de cada pantalla; desborde horizontal 0.
- Prueba de punta a punta del rediseño (19 pasos, todos bien): filtros del inicio y la cartelera,
  menú de celular, estados de funciones, barra de compra, compra sin sesión pide entrar, DARFY
  (burbuja y pie), entrar, apartar un asiento, Mi cuenta, Fan Zone, aprobar la orden en el panel,
  boleto aprobado y salir.
- `tsc`, `eslint`, `vitest` y `next build`.
