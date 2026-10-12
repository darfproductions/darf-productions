# DARF 2.0 — Fase 3: el panel de producción (análisis y plan)

Estado: **APROBADO (2026-10-11).** Decisiones de Johann en la sección 9. En construcción: etapa 3A.

## Contexto

Johann pidió un escrito detallado de cómo será la Fase 3. No quiere solo un
editor de páginas: quiere una herramienta para que un equipo administrativo
maneje **toda la vida de una producción**. Eso va desde que se decide qué obra
hacer, pasando por la convocatoria, la audición (registro previo, asistencia y
evaluación), el elenco, los materiales, la información, las ventas y los
programas digitales.

Hoy existe esto:
- **1.0 (en producción):** un panel con roles globales (`fan`, `staff`,
  `admin`). Sirve para aprobar ventas, vender en taquilla, dar códigos de
  descuento, validar QR en puerta, subir galería y leer mensajes de contacto.
- **2.0 (DEV, Fase 2 terminada):**
  - Las obras viven en la base con una plantilla única (migraciones 0029 y 0030).
  - Hay estados de obra y una regla que impide publicar sin el kit.
  - Hay personas y créditos con foto por obra.
  - `/panel` en la web 2.0 es solo un aviso que manda al panel 1.0.

No se escribe código ni se toca la base hasta que Johann apruebe cada etapa.

---

## 1. La vida de una producción: demo paso a paso

Ejemplo ficticio: **"Teen Beach Movie", temporada 2027**. Cada paso dice quién
actúa, qué hace en el panel y qué queda guardado.

| # | Momento | Quién | Qué hace en el panel | Resultado |
|---|---|---|---|---|
| 0 | **Se decide la obra** | Director | "Nueva producción": nombre, temporada y sede tentativa. Asigna al equipo responsable (productora, dirección artística, taquilla). | La obra existe como **borrador**, invisible al público. Su espacio de trabajo ya está creado. |
| 1 | **Preproducción** | Productora | Llena el **calendario maestro**: fechas de audición, ensayos y funciones. Abre una **lista de pendientes** (licencia de la obra, sede, presupuesto). Sube documentos internos. | Todos saben qué sigue y para cuándo. |
| 2 | **Convocatoria** | Dirección artística | Crea la convocatoria con personajes buscados, requisitos (edad, tesitura, baile), fechas, sede y **formulario configurable** (qué pedir: video, foto, experiencia, horario). La publica. | Página pública `/audiciones/teen-beach` con botón "Inscribirme". |
| 3 | **Registro previo** | Postulante | Entra o crea su cuenta y llena el formulario. Si es menor de edad, se piden los datos y el **consentimiento del tutor**. Elige su **horario de audición** (bloques con cupo). Recibe confirmación con un **QR de audición**. | Solicitud en estado *inscrito*. El equipo la ve, la filtra y puede pedir correcciones. |
| 4 | **Revisión previa** | Dirección / jueces | Revisan solicitudes y videos. Pueden marcar *pasa a audición*, *en espera* o *no cumple requisitos*. | Lista final de convocados por horario. |
| 5 | **Día de audición: asistencia** | Mesa de registro | Desde el celular: escanea el QR o busca por nombre, marca **llegó**, asigna un **número de audición** e imprime o muestra la etiqueta. También registra a quien llegue **sin registro previo** (alta rápida). | Asistencia en tiempo real: llegaron, faltan, en sala. |
| 6 | **Evaluación** | Jueces | Cada juez, en su celular o tablet, ve a la persona en turno (foto, número, personaje al que aspira) y la califica con una **rúbrica** (canto, actuación, baile, presencia, 1–5), más **notas privadas** y etiquetas ("callback para Mack"). | Calificaciones individuales que **solo ven los jueces y la dirección**. |
| 7 | **Callbacks y deliberación** | Dirección | Ve el **tablero consolidado**: promedios, comparativa por personaje y notas. Arma la ronda de callbacks (nueva cita con aviso) y repite los pasos 5 y 6 si hace falta. | Propuesta de reparto. |
| 8 | **Elenco** | Dirección / productora | Asigna personajes, ensamble, cover y suplentes. Envía **ofertas**: la persona acepta o declina desde su cuenta. Al aceptar se vuelve **crédito de la obra** sin volver a capturar datos. Se registra el **equipo técnico y creativo** de la misma forma. | Reparto y equipos en la página de la obra, cada uno con su foto **de esta obra**. |
| 9 | **Arranque del elenco** | Productora | Carga documentos por persona: reglamento firmado, permisos de menores, contacto de emergencia, **medidas de vestuario**, cuota si aplica. | Expediente completo por integrante, con un semáforo de lo que falta. |
| 10 | **Ensayos** | Stage manager | Publica el calendario de ensayos (quién se cita a cada uno, por escena o personaje). Toma **asistencia de ensayo** y registra retardos y justificantes. | Historial de asistencia por persona. |
| 11 | **Materiales** | Dirección vocal / coreografía | Sube partituras, pistas, libreto, videos de coreografía y reglas del montaje, con **acceso por grupo** (todo el elenco, solo ensamble, solo un personaje). | El elenco los ve en su **portal** (Mi Cuenta → Mis producciones). No son públicos. |
| 12 | **Comunicados** | Productora | Escribe avisos ("ensayo general se recorre a las 5") para todo el elenco, un grupo o una persona. Lleva **confirmación de lectura**. | Fin del "¿alguien vio el mensaje?". Queda historial. |
| 13 | **Página pública y venta** | Contenido / taquilla | Termina el editor de la obra (kit, sinopsis, canciones), previsualiza y **publica**. Crea funciones, precios por zona y descuentos. Pone la venta en marcha. | Obra en cartelera con venta abierta (la boletería actual, sin cambios en su lógica). |
| 14 | **Operación de ventas** | Taquilla | Aprueba o rechaza órdenes, vende en taquilla, reenvía boletos y ve el **tablero de ventas** por función y zona. | Ingresos y ocupación al día. |
| 15 | **Programa digital** | Contenido | Arma el programa: portada, reparto, canciones, notas de dirección, agradecimientos y patrocinadores. Casi todo se **llena solo** con los datos de la obra. | Un QR en sala lleva a `/programa/teen-beach`. Se ve bien en celular y no requiere imprimir. |
| 16 | **Día de función** | Puerta / stage manager | El personal de puerta valida QR **solo de su función**. El stage manager ve la hoja de sala: asistencia del elenco, llamados e incidencias. | Acceso controlado y bitácora del día. |
| 17 | **Cierre** | Productora / director | Reporte final: boletos vendidos, asistencia y descuentos usados. Sube la galería y los videos (Fan Zone). Cambia la obra a **archivada**. | La obra queda en el archivo con todo su historial. Nada se borra. |

---

## 2. Lo que pediste y lo que agrego

**Lo que pediste:**
- Definir la producción.
- Convocatoria.
- Registro previo.
- Asistencia el día de la audición.
- Evaluación.
- Elenco.
- Materiales.
- Información.
- Ventas.
- Programa digital.

**Lo que falta y propongo (cosas que un equipo real necesita):**
1. **Permisos por obra y por tarea.** Por ejemplo: un juez solo ve la
   audición, puerta solo valida su función, taquilla no ve las evaluaciones.
2. **Datos de menores y consentimiento.** Datos del tutor, aviso de
   privacidad, permiso de uso de imagen y cuánto tiempo se guardan los datos.
   Es obligatorio si el elenco tiene alumnos menores de edad.
3. **Calendario maestro y lista de pendientes** por producción.
4. **Asistencia a ensayos** e historial de cada integrante.
5. **Expediente del integrante:** documentos, contacto de emergencia,
   vestuario y cuota.
6. **Ofertas de papel con aceptación**, para no asignar a alguien sin su
   confirmación.
7. **Portal del elenco**, para que la información no viva en WhatsApp.
8. **Comunicados con confirmación de lectura** y avisos por correo.
9. **Bitácora:** quién cambió qué y cuándo. Imprescindible en ventas y
   evaluaciones.
10. **Nada se borra:** archivar y cancelar conservan el historial (lo pide la
    visión, §5.4).
11. **Duplicar una producción** como punto de partida, para no empezar de cero
    cada temporada.
12. **Reportes:** ventas, ocupación, descuentos, asistencia a audiciones y
    ensayos.
13. **Licencia de la obra y patrocinadores:** fechas y condiciones de derechos;
    los patrocinadores aparecen en el programa.
14. **Lista de espera** cuando una función se agota (propuesta para Fase 4).

---

## 3. Quién usa el panel (roles)

Una sola cuenta por persona: una misma persona puede ser postulante, elenco y
juez (visión §12). Los roles se asignan **por producción**, salvo el Director.

| Rol | Alcance | Puede | No puede |
|---|---|---|---|
| **Director (super admin)** | Toda la plataforma | Crear obras, asignar roles, ver todo, configurar | Ver contraseñas ni secretos (eso queda fuera de la app) |
| **Productor(a) de la obra** | Sus obras | Todo dentro de su obra: equipo, calendario, comunicados, publicar | Tocar otras obras |
| **Dirección artística** | Sus obras | Convocatoria, evaluación, elenco, materiales | Ventas y precios |
| **Juez** | Una convocatoria | Calificar y anotar a los convocados | Ver datos de contacto completos ni ventas |
| **Mesa de registro** | Un día de audición | Asistencia y alta rápida | Ver calificaciones |
| **Taquilla** | Funciones de sus obras | Órdenes, taquilla, descuentos, reportes de venta | Audiciones y elenco |
| **Puerta** | Funciones asignadas | Validar QR | Ver ventas y datos personales |
| **Contenido** | Sus obras | Editor de página, galería, Fan Zone, programa | Ventas y evaluaciones |
| **Integrante** (elenco o equipo) | Su obra | Portal: calendario, materiales, comunicados, su expediente | Nada administrativo |
| **Postulante / fan** | Su cuenta | Inscribirse, comprar, Fan Zone | — |

**Cómo se hace seguro:**
- En la base: una tabla de **miembros por obra** (persona, obra, rol) y una
  tabla fija de **qué puede cada rol** (módulo y acción).
- Una función de la base (`puede(obra, 'ventas.aprobar')`) la usan todas las
  reglas RLS y las acciones del servidor.
- Ocultar botones es solo comodidad: la base rechaza lo que no corresponde
  (visión §7.3).
- Los roles globales actuales se respetan durante la transición: `admin`
  equivale a Director y `staff` a Taquilla y Puerta en todas las obras. Así el
  panel 1.0 sigue sirviendo hasta el lanzamiento.

---

## 4. Cómo se ve el panel (estructura)

```
/panel                         Inicio: mis obras, pendientes, alertas (órdenes por aprobar,
│                              documentos faltantes, audiciones de hoy)
├─ Producciones                Lista + "Nueva producción" + "Duplicar"
│   └─ [obra]                  Espacio de trabajo de UNA obra (pestañas según tu rol)
│       ├─ Resumen             Estado, calendario maestro, pendientes, equipo responsable
│       ├─ Página pública      Editor por secciones + vista previa + Publicar/Archivar
│       ├─ Audiciones          Convocatorias → Solicitudes → Día de audición → Evaluación → Callbacks
│       ├─ Elenco y equipos    Reparto, ensamble, equipos, ofertas, expedientes, fotos de la obra
│       ├─ Ensayos             Calendario, citados, asistencia
│       ├─ Materiales          Archivos por grupo (privados)
│       ├─ Comunicados         Avisos con confirmación de lectura
│       ├─ Funciones y boletos Funciones, precios, descuentos, órdenes, taquilla, reportes
│       ├─ Puerta              Escáner QR (solo funciones asignadas)
│       ├─ Programa digital    Armado y vista previa del programa
│       ├─ Fan Zone            Ensayos en video, galería de ensayos
│       └─ Permisos de la obra Quién tiene qué rol en esta obra
├─ Personas y talento          Directorio central (Fase 5 lo amplía con la base de talento)
├─ Usuarios y roles            Solo Director
├─ Mensajes de contacto
└─ Bitácora                    Solo Director
```

Mismo estilo que la dirección A2 (el tablero "Panel-admin" del lienzo que te
gustó), pensado para usarse **desde el celular** en la audición, en el ensayo
y en puerta.

---

## 5. Cómo se construye (técnico, resumido)

- **Dónde vive:** dentro de la web 2.0 (`web/src/app/panel/...`). Usa
  acciones del servidor de Next.js y la misma sesión que ya existe en
  `web/src/lib/auth.ts` (`requireSession`).
- **Base de datos:** migraciones nuevas, siempre primero en DEV, con pruebas
  SQL como las de 0029. Se reutiliza:
  - `people` y `production_credits`: el elenco aceptado se vuelve crédito.
  - `productions.estado` y su trigger.
  - El bucket `producciones` para el kit y los retratos.
  - `gallery_photos`.
  - Los RPC de boletería **sin cambiar su lógica**. El panel nuevo solo los
    llama: `approve_order`, `reject_order`, `admin_create_seated_order`,
    `admin_cancel_ticket` y `check_in_ticket`.
- **Tablas nuevas (borrador del modelo):**
  - Permisos: `production_members` (persona/cuenta, obra, rol) y
    `role_permissions`.
  - Bitácora: `audit_log` (registro automático en tablas sensibles).
  - Calendario y pendientes: `production_events` (audición, ensayo, función,
    otro) y `production_tasks`.
  - Audiciones:
    - `auditions` (convocatoria).
    - `audition_roles` (personajes buscados).
    - `audition_slots` (horarios con cupo).
    - `audition_form_fields` (formulario configurable).
    - `audition_applications` (solicitud, respuestas y estado).
    - `audition_checkins` (llegada y número).
    - `audition_scores` (juez, criterio, puntaje).
    - `audition_notes` (privadas).
    - `audition_rounds` (callbacks).
  - Elenco y expedientes:
    - `casting_offers` (oferta, aceptación).
    - `member_documents` (permiso, reglamento, emergencias, medidas).
    - `guardians` (tutor de menores).
  - Ensayos: `rehearsal_calls` (citados) y `rehearsal_attendance`.
  - Materiales y comunicados:
    - `materials` (archivo privado, grupo con acceso).
    - `announcements` (aviso).
    - `announcement_reads` (confirmación de lectura).
  - Programa digital: `program_pages` (notas de dirección, patrocinadores; el
    resto sale de la obra).
- **Archivos privados:** buckets nuevos `audiciones` (videos y fotos de
  postulantes) y `materiales`. Son privados, con enlaces que caducan. Las
  imágenes del kit se validan al subirlas: tamaño y proporción 16:9.
- **Correos:** las confirmaciones y avisos necesitan un servicio de correo
  (Supabase Auth ya envía los de cuenta). Para avisos masivos hace falta un
  proveedor externo, lo que requiere aprobación (visión §15.5).
- **Pruebas:**
  - SQL de permisos por rol en cada módulo: un juez no ve ventas, puerta no ve
    datos personales.
  - Pruebas unitarias de reglas: promedios, cupos de horario, numeración.
  - Revisión en DEV con datos ficticios antes de pasar a la siguiente etapa.

---

## 6. Orden propuesto: Fase 3 en 6 etapas entregables

Cada etapa se prueba en DEV y necesita tu visto bueno antes de seguir. La
visión original separaba boletería (Fase 4) y audiciones (Fase 5). Aquí se
integran al panel, pero la **lógica de boletería no cambia**. Los cambios de
fondo (PDF, vencimiento de órdenes, admisión general) siguen en la Fase 4.

| Etapa | Qué entrega | Por qué en este orden |
|---|---|---|
| **3A. Base del panel** | Estructura, inicio, roles por obra, función `puede()`, bitácora y gestión de usuarios (Director) | Todo lo demás depende de saber quién puede qué |
| **3B. Editor de producción** | Nueva/duplicar obra, editor por secciones, subir logo/ambiente/retratos con validación, vista previa, publicar/archivar, elenco y equipos manual, galería y Fan Zone | Cierra la Fase 2: crear obras sin código |
| **3C. Funciones y boletería en el panel nuevo** | Funciones, precios, descuentos, órdenes, taquilla, puerta y reporte de ventas, llamando a los RPC actuales | Permite retirar el panel 1.0 al lanzar |
| **3D. Audiciones** | Convocatoria, formulario configurable, horarios, registro previo con QR, menores y consentimiento, mesa de registro, evaluación por jueces, tablero consolidado, callbacks | Es el flujo nuevo más grande; necesita 3A |
| **3E. Elenco y portal** | Ofertas y aceptación, expedientes, calendario y asistencia de ensayos, materiales privados, comunicados con lectura | Usa lo que deja la audición |
| **3F. Programa digital y reportes** | Programa digital por obra con QR, reportes de ventas, ocupación y asistencia, cierre de temporada | Se arma con datos que ya existen |

**Si la próxima audición es pronto, 3D puede ir justo después de 3A.** Esa
decisión es tuya.

---

## 7. Riesgos y cuidados

- **Datos de menores y evaluaciones:** son los datos más sensibles. Van con
  acceso mínimo, aviso de privacidad, consentimiento y un plazo para
  borrarlos. Hay que redactar el aviso; te propondré un texto, pero lo ideal
  es que lo revise alguien con conocimiento legal.
- **Boletería:** el panel nuevo no reescribe las reglas de venta; solo las
  usa. Se vuelven a correr las pruebas de boletería en cada etapa.
- **Tamaño:** es mucho. Por eso va en 6 etapas, cada una usable por sí misma.
- **Costos:** el plan Hobby de Vercel no permite uso comercial y Supabase Free
  no tiene respaldos. Antes de usar datos reales (audiciones con menores) hay
  que contratar los planes pagos. Lo pongo como condición antes de la etapa
  3D en producción.
- **Correo masivo:** requiere un proveedor externo y tu aprobación.

---

## 8. Decisiones que necesito de Johann

1. **Orden de etapas:** ¿3A → 3B → 3C → 3D → 3E → 3F, o adelantamos
   Audiciones porque hay convocatoria próxima? ¿Cuándo es la siguiente?
2. **¿Las audiciones tienen costo de inscripción?** Si sí, ¿se paga como los
   boletos (WhatsApp y aprobación)?
3. **Rúbrica de evaluación:** ¿qué criterios califican (canto, actuación,
   baile…) y en qué escala?
4. **¿Hay cuota para el elenco?** ¿Se le da seguimiento en el expediente?
5. **Roles:** ¿la lista de la sección 3 refleja cómo trabaja tu equipo? ¿Falta
   alguno (vestuario, maquillaje, coreografía)?
6. **Postulantes sin cuenta:** ¿se exige cuenta para inscribirse? Lo
   recomiendo, porque luego la misma cuenta sirve para el portal del elenco.

---

## 9. Decisiones de Johann (2026-10-11)

1. **Orden:** 3A → 3B → 3C → 3D → 3E → 3F.
2. **Audiciones sin costo** de inscripción.
3. **Evaluación:** canto, baile, actuación y actitud (escala 1–5), más notas
   personales del juez, privadas.
4. **El elenco paga mensualidad.** El expediente (3E) lleva el monto, los meses
   pagados o pendientes y quién registró cada pago. Solo lo ven la productora y
   el Director (permiso `mensualidades.gestionar`).
5. **Roles:** además de los de la sección 3 existen **Staff** y **Maquillaje**,
   y el Director puede crear **roles personalizados** (por ejemplo "Vestuario")
   eligiendo sus permisos.
6. **Hace falta cuenta** para inscribirse a una audición.

## 10. Audiciones 2.0 (ajuste de 3D, decisiones de Diego, 2026-10-11)

> Nota: las decisiones registradas antes como "de Johann" son de Diego (DARF Productions).

- **Convocatorias de obra o generales.** Una convocatoria puede pertenecer a una obra
  (usa sus colores y su página muestra "Audiciones abiertas") o ser general (p. ej. un
  llamado de bailarines). Las generales las crea el Director en **Panel → Audiciones**.
- **Equipo por convocatoria.** Además del equipo de la obra, cada convocatoria puede tener
  su propio equipo (Mesa de registro, Juez, Dirección…). En las generales lo arma el
  Director; en las de obra, quien da permisos en la obra. Queda en la Bitácora.
- **Opciones por convocatoria:** pedir datos del tutor (apagable solo si se confirma que la
  escuela u organización ya tiene la autorización de los padres), pedir foto, que el
  aspirante elija horario o que el equipo lo asigne, visible para todos o solo con enlace,
  y números al llegar o por asignación previa.
- **Plantillas al crear:** Audición abierta, Audición en escuela, Convocatoria de bailarines.
- **Asignación previa:** número al inscribirse; "Ordenar por horario" (horario y fecha de
  inscripción) y ↑ ↓ para mover a alguien. Quien ya llegó conserva su número.
- **Día de la audición:** lista en orden con Llegó → Entró → Terminó (hora de cada paso),
  "Sigue: Nº…", resumen (esperando, en sala, terminaron, faltan), filtro por horario y
  actualización automática cada 20 s.
- **Videos:** enlaces de YouTube (no listado) o Google Drive en la ficha de cada aspirante,
  más videos generales del día por grupo. Los jueces los ven; los aspirantes no. En 3E la
  ficha se liga al expediente de quien entre al elenco.
- Base de datos: migración `0037_auditions_v2.sql` (pruebas `0037_auditions_v2_test.sql`,
  T1–T8). En DEV se aplica con `supabase/dev/apply_0037_dev.sql` en el SQL Editor.

## 11. Más tipos de audición (decisiones de Diego, 2026-10-11)

- **Al crear:** arriba Audición abierta, Audición en escuela, Convocatoria cerrada (solo
  enlace, fuera de escuela) y Personalizada (en blanco o una plantilla guardada). En
  “Ver más plantillas”: por forma (En línea, Mixta, Particular por invitación) y por perfil
  (Bailarines, Cantantes, Ensamble, Papeles principales, Acróbatas y aéreo, Convocatoria
  profesional, Músicos, Equipo técnico y crew). Cada plantilla deja opciones, preguntas,
  criterios y requisitos (código: `web/src/lib/audition-templates.ts`).
- **Hombres / mujeres:** no son plantillas; el perfil va en cada personaje y se filtra por
  personaje en Solicitudes y Resultados (nadie queda fuera de la inscripción).
- **Forma:** presencial, en línea (sin día presencial; los jueces califican los videos) o
  mixta (video al inscribirse + día presencial).
- **Por invitación:** solo los correos invitados se inscriben; siempre “solo con enlace”;
  el invitado lo ve en Mi cuenta (“Te invitaron a audicionar”).
- **Criterios propios:** 1 a 8 por convocatoria, cada uno de 1 a 5; por defecto canto,
  baile, actuación y actitud. Las calificaciones anteriores se copiaron al nuevo formato.
- **Plantillas propias:** “Guardar como plantilla” en Configuración; las ve quien gestiona
  audiciones; solo su autor o el Director las borra.
- Base de datos: `0038_audition_types.sql` (pruebas T1–T5). En DEV:
  `supabase/dev/apply_0038_dev.sql` en el SQL Editor.

## 12. Cancelar o borrar una convocatoria (pedido de Diego, 2026-10-11)

- **Cancelar:** estado “Cancelada”. Se conserva todo, ya nadie se inscribe y los inscritos
  lo ven en la página de la convocatoria y en Mi cuenta. Se puede reabrir.
- **Borrar para siempre:** para la que quedó mal hecha; hay que escribir el título para
  confirmar. Se borran inscripciones, calificaciones, horarios, preguntas, invitaciones,
  videos (enlaces) y fotos. Sin inscritos la borra quien la gestiona; con inscritos, solo
  quien arma su equipo (obra: quien da permisos; general: el Director). Queda en la Bitácora.
- Base de datos: `0039_audition_cancel_delete.sql` (pruebas T1–T3). En DEV:
  `supabase/dev/apply_0039_dev.sql` en el SQL Editor.

## 13. Etapa 3E en 5 bloques (decisiones de Diego, 2026-10-11)

Orden: 1) Elenco y ofertas, 2) Expediente y mensualidades, 3) Ensayos y asistencia,
4) Materiales y comunicados, 5) Portal del elenco. Se prueba al terminar cada bloque.

- Expediente: lo llena el integrante desde su portal y la producción lo revisa.
- Mensualidades: el integrante ve solo las suyas; los pagos los registra la producción
  (sin pago en línea).
- Documentos: lista de "entregado" con fecha + archivo opcional (privado).
- Avisos: dentro de la página (Mi cuenta con contador). Correo/WhatsApp, aparte.

**Bloque 1 — Elenco y ofertas** (`0040_casting_offers.sql`, pruebas T1–T3):
- Oferta (reparto, ensamble, creativo, producción, crew, técnico + personaje o puesto,
  mensaje y fecha límite) desde Resultados de una audición o por correo en Elenco y equipos.
- La persona acepta o declina en Mi cuenta. Al aceptar: su ficha de persona (ligada a su
  cuenta), su crédito en la obra y el rol Integrante. La solicitud de audición queda
  "Seleccionado".
- El Integrante no tiene permisos de panel y ya no cuenta como "equipo de la obra".
- Pendiente: si la persona ya tenía crédito capturado a mano (sin cuenta), se crea otra
  ficha con su cuenta; unirlas queda para la limpieza de nombres duplicados.

**Bloque 2 — Expediente y mensualidades** (`0041_member_files.sql`, pruebas T1–T6):
- Expediente por integrante y obra: datos personales, emergencia, tutor, salud y medidas.
  Lo llena el integrante en Mi cuenta → Mis producciones; la producción (expedientes.ver)
  lo corrige y marca "revisado"; si el integrante cambia algo, vuelve a "por revisar".
  Los datos de salud no van a la Bitácora.
- Documentos por obra (lista básica: reglamento, permiso de menores, identificación) con
  archivo opcional privado (bucket `expedientes`) y "entregado" que marca la producción.
- Semáforo: rojo (falta información), amarillo (por revisar), verde (completo).
- Mensualidad de la obra (monto, meses, día límite), beca o monto especial por persona
  y pagos registrados (quién, cuándo, método). Quien solo maneja mensualidades no ve
  datos de salud. El integrante ve solo lo suyo.

**Ajustes al bloque 2** (decisiones de Diego, `0042_talent_discipline.sql`, pruebas T1–T5):
- **Expediente único por persona** (`person_files`): emergencia, tutor, salud y medidas se
  llenan una vez y se reusan en cada obra. Por obra: "mis datos siguen vigentes" (integrante),
  "revisado" (producción), documentos, mensualidades e incidencias. Si la persona cambia sus
  datos, todas sus obras vuelven a "por revisar".
- **Documentos dirigidos:** a todos, solo menores, un grupo (reparto, ensamble…) o personas
  específicas (p. ej. responsiva de aéreo solo para dos personas), con instrucciones.
- **Incidencias:** nota interna, advertencia o grave; manuales o automáticas (mensualidad:
  1 advertencia por cada N meses vencidos; retardos y faltas con el bloque de ensayos).
  Límite por obra (3 por defecto) → "Requiere decisión" hasta registrar la medida (plática,
  aviso a papás, suspensión, baja). No se editan: se anulan con motivo. El integrante ve sus
  advertencias y graves, no las notas.
- **Ficha de talento** (`/panel/talento/<cuenta>`): obras, audiciones (respuestas, promedio,
  videos, horas), ofertas; el Director ve además incidencias de todas las obras. La producción
  ve lo artístico de quien está, audicionó o tiene oferta en su obra.
- **Talento** (solo Director): buscar personas sin importar acentos, unir fichas duplicadas y
  ligar una ficha a su cuenta.

**Bloque 3 — Ensayos y asistencia** (`0043_rehearsals.sql`, pruebas T1–T3):
- Ensayos por obra (título, fecha, hora de inicio y fin, lugar, notas) citando a todo el
  elenco, a uno o varios grupos o a personas específicas. Se pueden cancelar y reactivar.
- Asistencia desde el celular: presente, retardo (minutos), falta o justificada. Resumen y
  % de asistencia por integrante (también en su expediente).
- El integrante ve en Mi cuenta solo los ensayos a los que está citado, su asistencia y
  puede avisar "no podré ir" con motivo; la producción decide si queda justificada.
- Advertencias automáticas: 1 por cada N retardos y 1 por cada N faltas sin justificar
  (reglas de la obra en Expedientes), sin repetirse.

**Ajustes al bloque 3** (decisiones de Diego, `0044_enrollment_series.sql`, pruebas T1–T4):
- **Ingreso y baja de integrantes.** Cada integrante tiene fecha de ingreso (al aceptar la
  oferta; editable para quien entra a medio taller) y, si se va, baja con fecha y motivo.
  Solo se le cita a ensayos entre su ingreso y su baja; las mensualidades se cuentan solo en
  ese periodo. Al darse de baja sale de los créditos públicos; su historial (asistencia,
  incidencias, pagos, documentos) se conserva y su ficha de talento marca la baja. Se puede
  reactivar.
- **Ensayos recurrentes:** "Repetir" con días de la semana y fecha final (máx. 120); se
  puede cancelar un ensayo o la serie desde ese día.
- **Pendiente (en espera, decisión de Diego):** rúbrica de evaluación por producción para
  talleres en escuela, editable por los maestros desde la página.

**Pagos: inscripción, taller sin pagos y recaudación** (decisión de Diego, `0045_registration_fee.sql`, pruebas T1–T3):
- Inscripción por obra (un solo pago, completo aunque se entre tarde) además de la
  mensualidad (desde el mes de ingreso). Por persona: beca (mensualidades), mensualidad
  especial y "sin inscripción".
- "Este taller tiene pagos": apagado = no se cobra nada a nadie y no hay advertencias.
- Cada pago lleva concepto (mensualidad o inscripción). Recaudación por mes en que se cobró
  (inscripciones, mensualidades y total) y total del taller.

**Bloque 4 — Materiales y comunicados** (`0046_materials_announcements.sql`, pruebas T1–T3):
- Materiales privados por obra: archivo (bucket `materiales`, máx. 50 MB: PDF, audio,
  imagen, video corto) o enlace https (YouTube no listado, Drive). Tipo, carpeta y nota.
  Para todo el elenco, grupos o personas. Suben quienes tienen materiales.gestionar; ven
  materiales.ver (staff, maquillaje) y los integrantes activos a quienes va dirigido.
- Comunicados: título, mensaje, "importante", para todos, grupos o personas. El integrante
  pulsa "Enterado"; quien envía ve cuántos y quiénes lo leyeron y quiénes faltan. Mi cuenta
  muestra los avisos sin leer por obra.
- Quien se da de baja deja de recibir materiales y comunicados.

## 14. Pendientes futuros (pedidos por Diego, 2026-10-12)

1. **Base de datos interconectada de personas.** Cada persona del elenco (también las de
   la 1.0, capturadas a mano) ligada a su cuenta, para ver desde cualquier obra quién hizo
   cada papel y abrir su ficha: obras, audiciones, expediente; y, para el público, sus
   compras de boletos y funciones a las que fue.
   - Ya existe: ficha de talento (obras, audiciones, ofertas, incidencias), Panel → Talento
     (buscar sin acentos, unir duplicados, ligar ficha a cuenta) y la liga automática al
     aceptar una oferta.
   - Hecho en `0047_people_links.sql` (pruebas T1–T3): cada nombre en Elenco y equipos abre
     su ficha (con o sin cuenta); ficha de personas sin cuenta con sus obras y "Ligar a su
     cuenta"; "Posibles ligas" en Talento (mismo nombre, sin acentos, en el perfil o en una
     audición); compras y funciones a las que asistió en la ficha (solo Director); enlace
     "Ficha" desde Usuarios (también para el público).
2. **Códigos de vendedor por cuenta.** Hecho en `0050_seller_codes.sql` (ver §16).
3. **Avisos por correo y WhatsApp.** Requiere proveedor externo (correo: p. ej. Resend;
   WhatsApp: API de WhatsApp Business de Meta, con verificación del negocio, plantillas
   aprobadas y costo por conversación) y aprobación de Diego (visión §15.5). Lectura:
   enlace único en el correo que marca "leído" al abrirlo; WhatsApp informa "leído" a
   través de su API.
4. **Rúbrica de evaluación por producción** (talleres en escuela), editable por los
   maestros desde la página. En espera.
5. **Fan Zone con más tipos de contenido.** Hoy son videos y galería. Pedido: poder poner
   también enlaces, documentos (PDF), fotos y otros contenidos, y acomodarlos.
6. **Mi cuenta completa.**
   - Datos: nombre, apellidos, teléfono, correo (con verificación), cambio de contraseña,
     fecha de nacimiento y foto de perfil.
   - Cumpleaños de todos registrados.
   - Plan completo en `docs/DARF-2.0-PLAN.md`.

## 15. Etapa 3F: programa digital y reportes (2026-10-12)

- **Programa digital** (`0048_program.sql`, pruebas T1–T3). Pestaña "Programa" de cada obra
  (permiso `programa.editar`: Producción, Contenido):
  - Se llena solo con la obra: reparto, ensamble, números musicales, equipos y
    agradecimientos de la Página pública. Se pueden ocultar canciones, equipos o
    agradecimientos.
  - Se agregan notas de dirección con firma, un mensaje extra y patrocinadores (nombre,
    enlace https y logo PNG/WebP/JPG en `producciones/<obra>/programa/`).
  - Se publica aparte de la obra. El público lo ve en `/programa/<obra>` solo si el programa
    está publicado **y** la obra está publicada o archivada. Quien edita lo ve antes.
  - QR para la sala, descargable como imagen.
- **Reportes** por obra (pestaña nueva, permiso `reportes.ver`). Cada sección aparece solo
  si además se tiene el permiso de esa área:
  - Boletos (`ventas.ver`): ingresos, vendidos, asistencia a funciones, en línea contra
    taquilla, ocupación por función y códigos de descuento usados.
  - Taller (`mensualidades.gestionar`): lo cobrado por mes, mensualidades e inscripciones.
  - Ensayos (`ensayos.gestionar` o `expedientes.ver`): asistencia total y quién está por
    debajo de 80 %.
  - Audiciones (`audiciones.gestionar`): solicitudes por estado en cada convocatoria.
- La lógica de los reportes está en `lib/report-rules.ts`, con pruebas.
- **Tres formas de programa** (`0049_program_modes.sql`, pruebas T1–T3; pedido de Diego):
  plantilla de la página (lo de arriba), **enlace** externo (Canva, Drive…) o **archivo**
  subido (PDF o imagen, máx. 20 MB). El botón "Programa de mano" de la página de la obra y
  el QR siempre van a `/programa/<obra>`, que lleva a la forma elegida; así el QR impreso
  no cambia. No se puede publicar en modo enlace o archivo sin el enlace o el archivo.
  El bucket público `producciones` ahora acepta PDF y hasta 20 MB.

## 16. Códigos de vendedor (decisiones de Diego, 2026-10-12)

`0050_seller_codes.sql`, pruebas T1–T6. Cambia la lógica de compra solo en el código de
vendedor (aprobado por Diego).
- **Un código fijo por cuenta**, generado solo: 3 letras del nombre + 4 al azar (p. ej.
  `ANA7K2Q`). Las cuentas nuevas lo reciben al registrarse.
- **Dónde vale:** en cada obra, solo para su elenco (integrante activo o crédito activo
  ligado a la cuenta). Con el permiso nuevo `vendedores.gestionar` (Producción y Taquilla),
  en Boletos → Vendedores se puede:
  - desactivar a alguien del elenco;
  - activar a cualquier cuenta por su correo;
  - crear vendedores externos sin cuenta (p. ej. una compañía).
- **Al comprar:** el código se revisa al escribirlo y muestra "Vendedor: Ana P.". Si no
  existe o no está activo en esa obra, no deja comprar hasta corregirlo o borrarlo. La base
  lo vuelve a revisar al crear la orden, en línea y en taquilla.
- **Link para compartir** `/producciones/<obra>?v=CODIGO`: el código llega solo a "Elegir
  asientos", aunque el comprador tenga que iniciar sesión.
- **Medición:** órdenes, boletos y monto aprobados, más los pendientes. Sin comisión.
  - "Mis ventas" en Mi cuenta, con un botón para copiar el link de cada obra en venta.
  - Tabla de vendedores en el panel.
  - "Ventas por vendedor" en Reportes.
- **Vendedores de la 1.0** (sin cuenta): al migrarlos hay que activarlos en la obra que
  corresponda.

## 17. Mi cuenta completa (pedido de Diego, 2026-10-12)

`0051_account_profile.sql`, pruebas T1–T5.
- **Perfil:**
  - nombre(s) y apellidos por separado. `profiles.nombre` sigue siendo el nombre completo
    que se muestra en todo el sitio y se arma solo. Lo que había en "nombre" pasó a
    "nombres";
  - teléfono;
  - fecha de nacimiento;
  - foto personal en el bucket privado `avatares`. La ven la persona, el Director y el
    equipo de sus obras. No es el retrato de los créditos.
- **Fecha de nacimiento única:** la de la cuenta y la del expediente se copian entre sí.
- **Correo:** cambio con enlace de confirmación de Supabase. Mientras no se abra, sigue el
  correo actual.
- **Contraseña:**
  - cambio que pide la actual;
  - "¿Olvidaste tu contraseña?" en Entrar: el enlace abre `/cuenta/contrasena`, con una
    cookie de 15 minutos que solo da ese enlace.
- **Cumpleaños:**
  - Panel → Cumpleaños (Director: todos, por mes, con edad y foto);
  - tarjeta "Cumpleaños del mes" en el resumen de cada obra (equipo con obra.ver);
  - la misma tarjeta en el portal del elenco (solo día y mes).
- **Mis boletos:** próximas funciones arriba; las pasadas en "Funciones pasadas", sin QR.

## Cómo se comprueba cada etapa

- Pruebas SQL de permisos por rol (en local y en DEV) y las de boletería sin cambios.
- Pruebas de reglas (promedios, cupos, numeración) en CI.
- Revisión de Johann en la web de pruebas con datos ficticios antes de pasar a la siguiente etapa.
