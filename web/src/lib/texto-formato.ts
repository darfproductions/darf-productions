// Formato sencillo para textos que escribe el equipo (descripción y requisitos de una audición): **negritas**,
// __subrayado__ y *cursivas*. Se convierte en partes con estilo, nunca en HTML, así que no se puede inyectar nada.
// Puro, con pruebas en texto-formato.test.ts.

export type Estilo = { negrita?: boolean; subrayado?: boolean; cursiva?: boolean };
export type Parte = { texto: string } & Estilo;

const MARCAS: { abre: string; clave: keyof Estilo }[] = [
  { abre: "**", clave: "negrita" },
  { abre: "__", clave: "subrayado" },
  { abre: "*", clave: "cursiva" },
];

/** Parte el texto en tramos con su estilo. Una marca sin cierre se deja tal cual. Las marcas se pueden anidar. */
export function partesFormato(texto: string, base: Estilo = {}): Parte[] {
  const out: Parte[] = [];
  let i = 0;
  let suelto = "";
  const soltar = () => { if (suelto) { out.push({ texto: suelto, ...base }); suelto = ""; } };
  while (i < texto.length) {
    const m = MARCAS.find((x) => texto.startsWith(x.abre, i));
    if (m) {
      const fin = texto.indexOf(m.abre, i + m.abre.length);
      // Solo cuenta si hay algo adentro y no empieza ni termina con espacio (así "5 * 3" no se vuelve cursiva).
      const dentro = fin > -1 ? texto.slice(i + m.abre.length, fin) : "";
      if (fin > -1 && dentro.trim() && dentro === dentro.trim()) {
        soltar();
        out.push(...partesFormato(dentro, { ...base, [m.clave]: true }));
        i = fin + m.abre.length;
        continue;
      }
      suelto += m.abre;
      i += m.abre.length;
      continue;
    }
    suelto += texto[i];
    i++;
  }
  soltar();
  return out;
}

/** El texto sin las marcas (para vistas previas, avisos o WhatsApp). */
export function sinFormato(texto: string): string {
  return partesFormato(texto).map((p) => p.texto).join("");
}

/** Envuelve lo seleccionado con la marca; sin selección, inserta la marca con un texto de ejemplo seleccionado. */
export function envolver(texto: string, desde: number, hasta: number, marca: "**" | "__" | "*"): { texto: string; desde: number; hasta: number } {
  const sel = texto.slice(desde, hasta);
  // Si lo seleccionado ya tiene la marca alrededor, se la quita (el botón funciona de ida y vuelta).
  if (texto.slice(desde - marca.length, desde) === marca && texto.slice(hasta, hasta + marca.length) === marca) {
    return { texto: texto.slice(0, desde - marca.length) + sel + texto.slice(hasta + marca.length), desde: desde - marca.length, hasta: hasta - marca.length };
  }
  // Los espacios de las orillas se quedan afuera de la marca.
  const ini = sel.length - sel.trimStart().length;
  const fin = sel.length - sel.trimEnd().length;
  const centro = sel.trim() || "texto";
  const nuevo = texto.slice(0, desde) + sel.slice(0, ini) + marca + centro + marca + sel.slice(sel.length - fin) + texto.slice(hasta);
  const a = desde + ini + marca.length;
  return { texto: nuevo, desde: a, hasta: a + centro.length };
}
