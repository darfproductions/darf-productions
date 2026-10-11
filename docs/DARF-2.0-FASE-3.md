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

## Cómo se comprueba cada etapa

- Pruebas SQL de permisos por rol (en local y en DEV) y las de boletería sin cambios.
- Pruebas de reglas (promedios, cupos, numeración) en CI.
- Revisión de Johann en la web de pruebas con datos ficticios antes de pasar a la siguiente etapa.
