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

## 2. El kit de producción (obligatorio para publicar)

| Pieza | Regla | Validación |
|---|---|---|
| Logo del título | Imagen con fondo transparente; siempre es el título del hero (el nombre en texto va como texto alternativo) | Obligatorio para publicar; el panel mide su contraste contra el fondo |
| Cartel oficial | Póster vertical o cuadrado; se muestra completo, nunca estirado ni recortado | Obligatorio; proporción entre 1:2 y 1:1 |
| Modo | `claro` u `oscuro`, según la identidad de la obra | Valor cerrado |
| Colores | Fondo, superficie, texto y acento (hex) | Texto/fondo y texto/superficie ≥ 4.5:1; acento/fondo ≥ 3:1 |
| Imagen de ambiente | Opcional; fondo del hero. Si falta: cartel desenfocado | Formato y peso máximo |
| Frase corta | 1 línea bajo el logo | Obligatoria, máx. 120 caracteres |

Lo que **no** cambia por obra: estructura, orden de secciones, tipografía
(Montserrat), menú y el botón de compra con la luz DARF.

Implementado hoy en `web/src/lib/themes.ts` para las tres obras; las reglas de
contraste se prueban en CI (`kits.test.ts`): si una obra no cumple, la
verificación falla. Mamma Mia pasa a **modo claro** (fondo blanco con flores,
como su identidad real), y su logo azul se lee.

## 3. La plantilla (orden fijo de secciones)

Hero (logo, cartel, ambiente, frase, sede/estado, botones) → Funciones y
precios → Sinopsis → Canciones por acto → Videos → Galería → Elenco y ensamble
→ Equipos (creativo, producción, crew, técnico) → Agradecimientos → Ficha
técnica. Una sección vacía se oculta sola; el orden no se edita por obra.

## 4. Modelo de datos propuesto (migración nueva `0029`, solo DEV primero)

Principio: **no se toca la boletería.** `productions.id` (texto: `showman`,
`mm`, `hsm`) se conserva porque funciones, asientos, órdenes y descuentos lo
referencian. `on_sale` y `concluded` siguen existiendo y funcionando igual.

**`productions` (columnas nuevas):** `estado` (`borrador`, `publicada`,
`archivada`, `cancelada`, `oculta`), `temporada`, `frase`, `sinopsis`, `modo`,
`color_fondo`, `color_superficie`, `color_texto`, `color_acento`, `logo_path`,
`cartel_path`, `ambiente_path`, `publicada_at`.
- Restricciones: colores con formato hex; `modo` cerrado.
- Trigger: no se puede pasar a `publicada` si falta una pieza obligatoria del kit
  (logo, cartel, colores, frase) o si los colores no cumplen el contraste
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
- Storage: bucket `producciones` para logo, cartel y ambiente (lectura
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
