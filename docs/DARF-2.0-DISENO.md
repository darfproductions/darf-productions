# DARF 2.0 — Dirección artística (D1)

Estado: **dirección A elegida, en refinamiento (ronda A2)** (2026-10-10).

Lienzo con las propuestas (privado, de Johann):
https://claude.ai/artifact/VLmNhMNNXfth4ztMkKtNvk

## Punto de partida

- **Logo:** "DARF" en sans pesada y ancha con degradado; "PRODUCTIONS" espaciado.
  Degradado medido sobre el archivo original, de izquierda a derecha:
  `#440ED5 → #630CB0 → #810888 → #A00662 → #BC033F`.
- **Material disponible en el repo:** carteles y títulos de cada obra (Showman:
  azul noche y dorado; Mamma Mia: ilustración, azul marino y flores rosas;
  HSM Jr: telón rojo y letras de marquesina). **No hay fotografía escénica real**
  (funciones, ensayos, elenco). Para la dirección elegida conviene reunir fotos
  de las producciones (incluidas las que ya se subieron a la galería de Supabase).

## Constantes en cualquier dirección

1. **La luz DARF:** el degradado del logo, usado como luz (destellos, bordes,
   botón de compra), no como relleno de pantallas.
2. **Voz tipográfica:** sans pesada y ancha en titulares; Montserrat como
   tipografía de texto (coincide con "PRODUCTIONS").
3. **Cada obra conserva su arte** dentro del marco DARF.

## Las tres direcciones

| | A · Noche de estreno | B · Pulso | C · Cartel |
|---|---|---|---|
| Carácter | Glamour teatral | Contemporáneo y vibrante | Editorial y cinematográfico |
| Fondo | Oscuro (terciopelo) | Claro con campos del degradado | Claro de revista |
| Titulares | Bodoni Moda itálica | Archivo Expanded Black | Instrument Serif |
| Recursos | Reflectores, dorado de marquesina, composición centrada | Cortes diagonales, etiquetas tipo sticker, cinta de títulos | Retícula de 12 columnas, imagen a sangre, créditos tipo película |

## Recomendación

Mezcla con reglas, no indiscriminada:

- **Estructura de C** (retícula editorial, jerarquía, imagen protagonista) en
  toda la web pública.
- **Luz y fondo de A** (sala oscura, reflectores con la luz DARF) en portada,
  cartelera y páginas de obra.
- **Energía de B, dosificada:** Fan Zone, audiciones y promociones.
- **Panel administrativo:** versión clara y sobria, misma tipografía, violeta
  DARF como color de acción.
- **Temas por producción:** cambian fondo, acento, arte del título e imagen;
  se mantienen estructura, tipografía, menú y el botón de compra con la luz
  DARF. El editor valida el contraste.

## Siguiente paso (D2)

Con la dirección elegida: sistema visual completo (tokens, componentes,
estados, animaciones) y maquetas de las 11 pantallas de la visión §4.6 en móvil
y escritorio.

## Ronda 2 (A2) — comentarios de Johann y respuesta

Comentarios: le gusta el camino de A y mucho el panel de administración; no le
encantan las tipografías de A; preocupa que la portada se vuelva exclusiva de
la producción principal y pierda identidad DARF.

Decisiones propuestas (tableros A2 en el lienzo):
- **Portada = DARF, página de obra = la obra.** La portada habla con la voz de
  DARF; la obra en cartelera aparece en una "ventana de escenario" destacada.
  Dentro de la página de la obra, ella toma el escenario completo.
- **Se va:** Bodoni itálica; dorado como color de marca (pasa al tema de
  Showman); imagen de la obra como fondo de la portada.
- **Se queda:** sala oscura, reflectores con la luz DARF, botón de compra con
  la luz DARF, el panel de administración.
- **Tipografía:** tres caminos (Eco del logo = Archivo Expanded, recomendado;
  Marquesina = Big Shoulders Display; Una sola familia = Montserrat Black).
  **Decisión de Johann (2026-10-10): una sola familia, Montserrat**
  (titulares en Montserrat Black). Aplicado en `web/`.
- **Portada sin obra en cartelera (pedido de Johann):** el lugar destacado pasa
  a la producción más reciente del archivo, con la etiqueta "Lo último que
  presentamos" y botón "Revivir la obra" en lugar de "Comprar boletos".
  Implementado y probado en `web/src/lib/home-rules.ts`.
- Johann aprobó la portada A2 ("mucho mejor que la actual").
