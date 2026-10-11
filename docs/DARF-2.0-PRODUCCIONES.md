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
información de más) e **imagen de ambiente obligatoria**.

**Actualización 2026-10-11 (Johann):** se descarta el "modo único oscuro".
**Cada obra elige su color de fondo** en su paleta (Mamma Mia vuelve a blanco
con flores, como HSM tiene rojo). La plantilla (medidas, orden, tipografía) no
cambia; solo se adaptan sombras y velos al fondo claro u oscuro. El menú DARF
queda siempre arriba, sobre la sala oscura, y el hero empieza debajo, para que
funcione con cualquier fondo.

| Pieza | Especificación | Validación |
|---|---|---|
| Logo del título | PNG o WebP con fondo transparente, en la **versión que se lee sobre el fondo de la obra**, mínimo 1200 px de ancho, sin márgenes vacíos | Obligatorio para publicar; se revisa a ojo en la vista previa |
| Imagen de ambiente | Horizontal **16:9**, mínimo **1920×1080**, **sin texto ni logos**; lo importante hacia la derecha (a la izquierda va el logo con un degradado) | Obligatoria; proporción ≥ 1.6 |
| Colores | Fondo (el que elija la obra, claro u oscuro), superficie, texto y acento, en hex | Texto/fondo y texto/superficie ≥ 4.5:1; acento/fondo ≥ 3:1 |
| Frase corta | Una línea bajo el logo | Obligatoria, máx. 120 caracteres |

**Material provisional en DEV (hay que reemplazarlo por el oficial):**
- Mamma Mia: logo oficial azul; ambiente recortado a 16:9 de las flores sobre
  pared blanca (original cuadrado de 1600 px, ampliado a 1920×1080).
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

**Secciones, en orden fijo (decisión de Johann, 2026-10-11):** Sinopsis →
Funciones y precios → Canciones → Elenco → Equipos → Galería → Videos →
Agradecimientos. Una sección vacía se oculta sola; el orden no se edita por obra.

**Ficha técnica:** a la derecha y fija al desplazarse en computadora; al final
en celular. Campos fijos en este orden: Temporada, Fechas, Sede (sale de la
base), Duración, Clasificación, Basada en; después, campos extra opcionales
(ej. "Colectivo" en HSM).

**Canciones:** actos opcionales (una obra puede tener una sola lista);
numeración continua entre actos (Acto II sigue donde termina el Acto I). HSM:
Acto I = canciones 1–7, Acto II = 8–12.

**Créditos — tipos fijos:** Reparto (persona + personaje), Ensamble, Equipo
creativo, Equipo de producción, Crew, Equipo técnico.

**Fotos de las personas, sin saturar la página:**
- Reparto: tarjetas con retrato vertical 3:4; se muestran 8 y el resto con
  "Ver todo el reparto".
- Ensamble: lista compacta con foto pequeña redonda; 9 visibles y el resto al
  desplegar.
- Equipos: un grupo plegable por tipo (solo el primero abierto), con foto
  pequeña, nombre y puesto.
- Sin foto: iniciales sobre el color de la obra.
- **Las fotos son de cada obra (decisión de Johann, 2026-10-11):** cada
  producción tiene sus propios retratos, porque normalmente se toman en una
  sesión para ESA obra (misma luz, fondo y vestuario) y así se ven uniformes.
  Si una persona participa en dos obras, tiene una foto distinta en cada una.
  La foto pertenece al crédito (`production_credits.foto_path`), no a la persona.

**Especificación de los retratos:** vertical 3:4, mínimo 900×1200 px, JPG o
WebP, rostro centrado en el tercio superior, misma sesión para toda la obra.
Se suben por obra, nombrados con el nombre completo de la persona.

Lo que **no** cambia por obra: estructura, medidas, orden, tipografía
(Montserrat), menú DARF y el botón de compra con la luz DARF.

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
- Restricciones: colores con formato hex (el fondo puede ser claro u oscuro).
- Trigger: no se puede pasar a `publicada` si falta una pieza obligatoria del kit
  (logo, ambiente, colores, frase) o si los colores no cumplen el contraste
  (función SQL de contraste, la misma fórmula que la web).
- Compatibilidad: `archivada` ⇔ `concluded = true`.

**Tablas nuevas:**
- `production_acts` (acto, orden) y `production_songs` (título, orden): la
  numeración se calcula sola por el orden.
- `people` (nombre público, `profile_id` opcional; **sin foto**): solo la
  identidad, base del **modelo central de personas** (visión §12), para que una
  persona sea a la vez elenco, equipo, talento o usuaria sin duplicarse y se
  pueda ver en qué obras ha participado.
- `production_credits` (persona, tipo: reparto/ensamble/creativo/producción/
  crew/técnico, personaje o puesto, orden, **`foto_path`**): el retrato de esa
  persona para ESA obra.
- `production_media` (título, YouTube, tipo: video/ensayo, visibilidad:
  público/fans, orden).
- `production_facts` (ficha técnica: etiqueta, valor, orden) y
  `production_thanks` (agradecimientos, orden).
- Storage: bucket `producciones` (lectura pública, escritura admin), una
  carpeta por obra: `<obra>/kit/` (logo y ambiente) y `<obra>/creditos/`
  (retratos). La galería sigue en `gallery_photos`.

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
