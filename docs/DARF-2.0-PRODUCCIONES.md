# DARF 2.0 — Plantilla de producción y modelo de datos (Fase 2)

Estado: **regla del kit aplicada en `web/` (2026-10-10); modelo de datos
PROPUESTO, pendiente de aprobación de Johann.** Nada de esto existe aún en la
base de datos.

## 1. Por qué

Pedido de Johann: si las producciones se van a crear desde la página, todas
deben regirse por **una sola plantilla** definida a nivel de base de datos,
para mantener la cohesión y facilitar el proceso. Sin regla, cada obra se ve
distinta (ej.: logo como título en Showman y HSM, texto en Mamma Mia porque su
logo azul no se leía sobre fondo oscuro).

## 2. El kit de producción — versión 2 (decisiones de Johann, 2026-10-10)

Cambios respecto a la versión 1: **sin cartel** (cambia de tamaño y trae
información de más), **modo único oscuro** para todas las obras, **imagen de
ambiente obligatoria**.

| Pieza | Especificación | Validación |
|---|---|---|
| Logo del título | PNG o WebP con fondo transparente, **versión para fondo oscuro** (claro/luminoso), mínimo 1200 px de ancho, sin márgenes vacíos | Obligatorio para publicar; contraste contra el fondo de la obra |
| Imagen de ambiente | Horizontal **16:9**, mínimo **1920×1080**, **sin texto ni logos**; lo importante hacia la derecha (a la izquierda va el logo con un degradado) | Obligatoria; proporción ≥ 1.6 |
| Colores | Fondo (oscuro), superficie, texto y acento, en hex | Texto/fondo y texto/superficie ≥ 4.5:1; acento/fondo ≥ 3:1; fondo oscuro |
| Frase corta | Una línea bajo el logo | Obligatoria, máx. 120 caracteres |

**Material provisional en DEV (hay que reemplazarlo por el oficial):**
- Mamma Mia: logo en versión clara **generado** a partir del oficial azul
  (`mm-logo-oscuro.webp`); ambiente generado a partir de las flores del cartel
  (papel blanco reemplazado por azul noche).
- Showman: ambiente recortado del escenario a 16:9, solo 1545 px de ancho
  (debajo del mínimo).
- HSM: ambiente recortado del telón a 16:9.

## 3. La plantilla (fija para todas las obras)

**Hero (altura fija: 660 px escritorio, 560 px celular):** imagen de ambiente
a todo lo ancho; degradado con el color de fondo de la obra desde la
izquierda; contenido abajo a la izquierda: etiqueta ("DARF Productions
presenta" / "Archivo"), **logo en caja fija** (520×192 px escritorio,
ancho completo × 128 px celular, alineado abajo a la izquierda, así todos los
logos se ven del mismo tamaño), frase corta, sede/estado, botones (Comprar
boletos con la luz DARF si hay función en venta; Fan Zone si hay material).

**Tarjeta de obra (cartelera, archivo, portada, Fan Zone):** proporción 16:9,
ambiente de fondo, logo centrado en caja fija (72 % × 60 %).

**Secciones, en orden fijo:** Funciones y precios → Sinopsis → Canciones por
acto → Videos → Galería → Elenco y ensamble → Equipos (creativo, producción,
crew, técnico) → Agradecimientos → Ficha técnica. Una sección vacía se oculta
sola; el orden no se edita por obra.

Lo que **no** cambia por obra: estructura, medidas, orden, tipografía
(Montserrat), menú, modo oscuro y el botón de compra con la luz DARF.

Implementado en `web/src/lib/themes.ts` y `web/src/components/PosterArt.tsx`;
las reglas del kit se prueban en CI (`kits.test.ts`).

## 4. Modelo de datos propuesto (migración nueva `0029`, solo DEV primero)

Principio: **no se toca la boletería.** `productions.id` (texto: `showman`,
`mm`, `hsm`) se conserva porque funciones, asientos, órdenes y descuentos lo
referencian. `on_sale` y `concluded` siguen existiendo y funcionando igual.

**`productions` (columnas nuevas):** `estado` (`borrador`, `publicada`,
`archivada`, `cancelada`, `oculta`), `temporada`, `frase`, `sinopsis`,
`color_fondo`, `color_superficie`, `color_texto`, `color_acento`, `logo_path`,
`ambiente_path`, `publicada_at`.
- Restricciones: colores con formato hex; fondo oscuro.
- Trigger: no se puede pasar a `publicada` si falta una pieza obligatoria del kit
  (logo, ambiente, colores, frase) o si los colores no cumplen el contraste
  (función SQL de contraste, la misma fórmula que la web).
- Compatibilidad: `archivada` ⇔ `concluded = true`.

**Tablas nuevas:**
- `production_acts` (acto, orden) y `production_songs` (título, orden): la
  numeración se calcula sola por el orden.
- `people` (nombre público, retrato profesional, `profile_id` opcional): base
  del **modelo central de personas** (visión §12), para que una persona sea a
  la vez elenco, equipo, talento o usuaria sin duplicarse.
- `production_credits` (persona, tipo: reparto/ensamble/creativo/producción/
  crew/técnico, personaje o puesto, orden).
- `production_media` (título, YouTube, tipo: video/ensayo, visibilidad:
  público/fans, orden).
- `production_facts` (ficha técnica: etiqueta, valor, orden) y
  `production_thanks` (agradecimientos, orden).
- Storage: bucket `producciones` para logo y ambiente (lectura
  pública, escritura admin). La galería sigue en `gallery_photos`.

**Permisos (RLS):** lectura pública solo de producciones `publicada` o
`archivada` (y sus tablas hijas); escritura solo admin por ahora. Los permisos
por producción (ej. "admin solo de Showman") llegan en la Fase 3 sobre estas
mismas tablas.

**Carga inicial:** el contenido de `web/src/content/producciones.ts` (extraído
de la 1.0) y los kits de `themes.ts` se cargan con un script a DEV; después la
web lee de la base y esos archivos transitorios se eliminan.

## 5. Cómo se comprueba

- Pruebas SQL nuevas (como las existentes): publicar sin kit falla; contraste
  insuficiente falla; lectura pública no ve borradores; boletería intacta
  (se vuelven a correr 0021–0028).
- La web DEV muestra las tres obras desde la base con el mismo resultado que hoy.
