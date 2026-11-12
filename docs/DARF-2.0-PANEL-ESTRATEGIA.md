# DARF 2.0 — Estrategia para el panel: más fácil, más completo (noviembre 2026)

Pedido de Diego (5-nov): que el panel sea mucho más fácil, amigable e intuitivo, y que funcione como el **centro de
operaciones e información** de todo DARF, para cuatro tipos de producción distintos. Este documento tiene tres
partes: cómo está hoy (con números), qué hacen bien los paneles mejor diseñados, y la estrategia por fases.

---

## 1. Cómo está el panel hoy (diagnóstico)

Medido sobre el código actual (rama `darf-2.0`):

| Dato | Hoy | Referencia sana |
|---|---|---|
| Páginas del panel | **82** | — |
| Páginas dentro de UNA obra | **42** | 8–12 visibles a la vez |
| Niveles de profundidad bajo `/panel` | **5** (obra → boletos → beneficios → entregas) | 3 |
| Etiquetas distintas en menús y pestañas | **68** | 20–25 |
| Secciones plegadas en Configuración de una audición | **11** en una sola página (329 líneas) | 3 pantallas cortas |
| Lugares donde se edita "la página pública" | 4 (Publicar, Contenido, Imagen, Avisos) + Difusión + Programa + Fan Zone | 1 con pestañas |
| Pantallas que recorre un juez el día de la audición | Configuración → Día → Modo audición → Evaluación → Votación → Cast | 1 pantalla guiada |

### Lo que lo hace laberíntico

1. **Todo está organizado por "dónde vive el dato", no por "qué quiero hacer".** Para "regresar una solicitud"
   hay que saber que eso está en Personas → Audiciones → (la audición) → Solicitudes → (tarjeta) → Revisar.
   Un panel intuitivo se organiza por tarea: *Revisar solicitudes (3 pendientes)*.
2. **Dos menús compiten.** El menú izquierdo (Inicio, Proyectos, Personas, Reportes, Sitio y público, Ajustes) y
   las pestañas de la obra (Resumen, Personas, Ensayos y equipo, Boletos, Público, Más) repiten palabras
   ("Personas" está en los dos y significa cosas distintas).
3. **Páginas largas con secciones plegadas** (Configuración de audición: 11 acordeones). Lo plegado "no existe"
   para quien no sabe que está ahí; además rompe el buscador del navegador.
4. **Las mismas 42 páginas para todos los tipos de obra.** Un taller en escuela no vende boletos pero ve
   "Boletos", "Puerta", "Taquilla", "Vendedores", "Comisiones"…
5. **No hay "qué sigue".** Audiciones tiene fases (inscripción → día → callback → votación → cast), pero cada una
   es una pestaña suelta; nadie te lleva de la mano.
6. **El integrante del elenco casi no tiene panel.** Lo suyo está repartido en Mi cuenta → Producción, Ensayo,
   Equipo, Notificaciones… y no hay un lugar para "¿dónde está el libreto?", "¿cómo aviso que voy a faltar?".
7. **Producción no puede buscar a una persona y ver todo.** El expediente existe (documentos, pagos, asistencia,
   incidencias) pero hay que llegar a él por la obra; no hay un "buscar a Ana" que lo abra.

### Lo que ya está bien y hay que conservar

- La base de datos y los permisos: son sólidos y granulares (eso no se toca).
- Buscador `Ctrl K` (existe, pero casi nadie lo descubre).
- "Por hacer en esta obra" en el Resumen y la bandeja de Inicio: es la semilla del panel por tareas.
- Las listas "Listo para vender" y "Antes de cerrar la temporada": ya son flujos guiados.
- El asistente de nueva producción (0135): el mismo patrón sirve para lo demás.

---

## 2. Qué hacen bien los paneles mejor diseñados

Patrones que comparten los paneles de administración más usados (tiendas, pagos, gestión de proyectos, eventos y
los sistemas de gestión escolar y de teatro) y que aplican directo a DARF:

| Patrón | Cómo se ve | Para DARF |
|---|---|---|
| **Inicio = "Hoy"** | Lo primero que ves es lo que te toca hoy, con números y un botón por tarea. Nada de menús. | Inicio por rol: "3 solicitudes por revisar", "Ensayo hoy 5 pm · 2 faltas avisadas", "Función mañana: 84 % vendido". |
| **Menú de 5 a 7 cosas** | Un solo menú corto a la izquierda; lo demás está dentro. | Hoy · Mis obras · Personas · Ventas · Sitio · Ajustes. |
| **Revelación progresiva** | Lo básico a la vista; lo avanzado detrás de "Más opciones". | Configuración de audición en 3 pantallas cortas; lo raro, en "Avanzado". |
| **Flujos guiados (wizard / checklist)** | Para procesos con etapas, una barra de pasos y "Siguiente". | Audición: una sola pantalla que cambia según la fase y tu rol. |
| **Una tabla que se ordena y filtra** | Listas largas = tabla con columnas, orden, filtros guardados y acciones en lote. | Solicitudes, elenco, órdenes, expedientes. |
| **Buscar para llegar** | Buscador global siempre visible: escribes "Ana" y abres su expediente. | Promover `Ctrl K` a barra fija con resultados de personas, obras, órdenes y páginas. |
| **El producto se adapta al plan** | Las secciones aparecen según el tipo de cuenta. | Tipo de obra (profesional / showcase / taller / escuela) enciende y apaga secciones. |
| **Portal del "cliente"** | La otra cara: lo que ve quien no administra, en 5 bloques claros. | Portal del integrante: Hoy, Mis documentos, Materiales, Avisos, Pedir/avisar. |
| **Estados vacíos que enseñan** | Una página vacía explica qué es y qué hacer primero. | "Aún no hay personajes. Agrégalos aquí para que la audición los use." |
| **Ayuda en contexto** | Un "?" al lado de la opción, no un manual aparte. | La "Guía de tu rol" convertida en ayudas junto a cada cosa. |

Principio que lo resume: **cada pantalla responde una sola pregunta y te dice cuál es la siguiente.**

---

## 3. Estrategia

Cinco bloques. Cada uno se puede hacer y publicar por separado; ninguno rompe lo que ya funciona.

### Bloque A · Nuevo esqueleto del panel (navegación)

**Menú izquierdo: 6 entradas, iguales para todos** (cada quien ve solo las que le tocan):

1. **Hoy** — lo pendiente y lo próximo, por rol (sustituye Inicio y la bandeja).
2. **Mis obras** — las producciones donde participo. Dentro de cada obra, **6 pestañas fijas**:
   Resumen · Equipo y elenco · Ensayos · Audiciones · Boletos · Página pública (+ "Más" para lo raro).
3. **Personas** — directorio con buscador: una ficha por persona con TODO (obras, documentos, pagos, asistencia).
4. **Ventas** — todas las obras juntas: órdenes, corte, reportes.
5. **Sitio** — portada, franja, Club Fan, eventos, showcases.
6. **Ajustes** — roles, Casa DARF, teatros, plantillas.

**Dentro de la obra:** cada pestaña es una página con **subpestañas horizontales** (no acordeones). Máximo 3
niveles: obra → pestaña → subpestaña. Lo que hoy está a 4 y 5 niveles sube.

**Buscador fijo arriba** (el `Ctrl K` actual, siempre visible): personas, obras, órdenes por código, páginas.

**Compatibilidad:** las 82 rutas actuales siguen existiendo y redirigen a su nuevo lugar. Nada se borra.

### Bloque B · Audiciones de principio a fin

1. **Configuración en 3 pantallas** (en vez de 11 secciones):
   - **Básico:** título, descripción, fechas, sede, personajes, publicar.
   - **Inscripción:** qué se pregunta (foto, perfil, tutor, horarios, preguntas propias, "pasan en grupo").
   - **Día y jueces:** equipo, criterios, entrevista del host, callback.
   Lo avanzado (plantillas, invitados, numeración, cancelar) en "Avanzado".

2. **Solicitudes como tabla** con orden por nombre, fecha, estado, personaje, edad, horario, "le falta algo";
   filtros guardados; acciones en lote (aprobar, regresar, pedir completar); vista de tarjetas para el celular.

3. **Día de la audición:**
   - orden por **horario** (además de llegada, registro y personaje);
   - **"Pasan en grupo" como pregunta del sistema** (`pedir_grupo`): quien se inscribe marca "sí" y escribe con
     quién. En Recepción, la lista de grupos muestra al lado de cada nombre lo que respondió, y sugiere los
     grupos sola (empareja nombres).
   - **Teen Beach Movie no pierde nada:** un script copia las respuestas de la pregunta abierta actual a la
     nueva columna (la pregunta vieja se queda guardada, solo deja de pedirse). Nadie vuelve a contestar.

4. **Una sola pantalla "Modo audición"** que reemplaza Entrevista + Modo audición + Evaluación + Votación + Cast
   como pestañas sueltas:
   - arriba, la **barra de fases** (Inscripción · Día · Callback · Votación · Cast) con la actual marcada y el botón
     "Siguiente fase" para el host o dirección;
   - abajo, **lo que te toca según tu rol**: recepción ve la puerta y la fila; el host, la entrevista y Siguiente;
     el juez, la ficha de quien está en escena y su calificación; en votación todos ven la boleta.
   - Las páginas actuales siguen vivas para quien ya las conoce.

### Bloque C · El panel como centro de operaciones del equipo

**Portal del integrante** (elenco y equipo, también el que no administra nada), 6 bloques en una pantalla:

| Bloque | Qué resuelve |
|---|---|
| **Hoy / Próximo** | Próximo ensayo o función, con lugar, hora, qué llevar y "Voy / Voy tarde / No puedo ir". |
| **Mis documentos** | Reglamento firmado, contrato, autorización, recibos. Firmados o pendientes, descargables. |
| **Materiales** | Libreto, partituras, pistas, videos de coreografía, por acto/canción. |
| **Avisos** | Comunicados de la obra con "leído". |
| **Pedir o avisar** | Permiso para faltar, llegada tarde, cambio de datos, duda al equipo. Un formulario, llega a quien toca. |
| **Mi obra** | Reparto, calendario completo, equipo y contactos, Ficha de la producción. |

**Para producción:** "Personas" con buscador: escribes "Ana" y ves su ficha completa en una página con pestañas
(Documentos · Pagos · Asistencia · Incidencias · Obras). Ahí sale "Reglamento: firmado 3-oct" o "pendiente".

**Preguntas frecuentes por obra:** producción escribe las respuestas una vez ("¿Dónde ensayamos?", "¿Qué pasa si
falto?") y aparecen en el portal; DARFY las usa también.

### Bloque D · Tipos de producción

Un campo `tipo` en cada obra que **enciende y apaga secciones y textos**:

| Tipo | Se muestra | Se oculta |
|---|---|---|
| **Profesional** | Contratos y pagos al elenco, boletería completa, audiciones con callback, comisiones | Cuotas, rúbrica escolar |
| **Showcase** | Lo que ya tiene (planes, medios, solicitudes), boletería ligera | Ensayos largos, expedientes, Fan Zone |
| **Taller (amateur)** | Cuotas y adeudos, asistencia, rúbrica, audiciones por invitación, boletería | Contratos, comisiones |
| **Escuela** | Rúbrica y boletas, asistencia, autorización de la escuela, materiales | Boletería (opcional), cuotas, Club Fan |

Esto reduce solo el menú de cada obra: un taller en escuela ve 6 pestañas y no 20. Las obras actuales quedan como
"profesional" (Showman) y "taller" o "profesional" (Teen Beach Movie, lo decides tú) sin cambiar nada de sus datos.

### Bloque E · Página pública más compacta

Una sola pestaña **Página pública** con subpestañas: Publicar · Textos · Imágenes · Avisos · Difusión · Programa.
Las imágenes en cuadrícula pequeña con "cambiar" al pasar el cursor; los pósters en una fila. Vista previa a la
derecha en pantallas grandes.

---

## 4. Lo que NO se toca (reglas para toda la estrategia)

- **Showman está a la venta.** Ninguna página pública (`/producciones/showman`, compra, boletos, QR, Wallet) cambia
  de comportamiento ni de dirección. Ninguna tabla de ventas, boletos u órdenes se altera. El panel puede
  reacomodarse porque solo cambia *dónde se ve*, no *qué se guarda*.
- **Teen Beach Movie tiene solicitudes.** Las tablas de audiciones no se recortan; lo nuevo se agrega al lado
  (columnas nuevas, valores por defecto). Las respuestas existentes se copian, nunca se piden de nuevo.
- **Las rutas actuales siguen funcionando** (redirigen). Ligas en WhatsApp, QR y correos ya enviados no se rompen.
- **Permisos y roles no cambian**: lo que alguien puede hacer sigue igual; cambia cómo llega.
- Cada bloque se publica con su prueba SQL, vitest, simulacro E2E y capturas, como siempre.

---

## 5. Orden propuesto y tamaño

| Fase | Qué | Tamaño | Por qué en este orden |
|---|---|---|---|
| **1** | Bloque B.3 (grupo del sistema + orden por horario + migración TBM) y B.2 (Solicitudes como tabla) | Mediano | TBM ya tiene solicitudes: es lo que usas primero. |
| **2** | Bloque B.1 y B.4 (Configuración en 3 pantallas + Modo audición guiado) | Grande | Antes del día de audición de TBM. |
| **3** | Bloque A (esqueleto nuevo: Hoy, menú de 6, pestañas de obra) + Bloque E (Página pública compacta) | Grande | Es el cambio que más se nota; va después de audiciones para no mover el piso mientras las usas. |
| **4** | Bloque D (tipos de producción) | Mediano | Aprovecha el esqueleto nuevo. |
| **5** | Bloque C (portal del integrante + Personas con buscador + FAQ) | Grande | Lo que convierte el panel en centro de operaciones. **Hecha (0141, 5-nov).** |

Cada fase se entrega completa, con capturas antes de subir.

---

## 6. Decisiones que necesito de Diego

1. **Tipo de Teen Beach Movie:** ¿profesional o taller? (Showman queda como profesional.)
2. **"Pasan en grupo":** ¿la pregunta del sistema pide solo "¿con quién pasas?" (texto) o también "¿cuántos son?"
   *Recomiendo solo el texto: menos fricción, y Recepción confirma.*
3. **Orden de las fases:** ¿empezamos por audiciones (fase 1 y 2) como propongo, o por el esqueleto (fase 3)?
   *Recomiendo audiciones: es lo que está en uso con TBM.*
4. **Portal del integrante:** ¿"Pedir o avisar" llega a Dirección, a Producción o a quien esté marcado como
   encargado del ensayo? *Recomiendo: al encargado del ensayo si es por un ensayo; si no, a Producción.*
