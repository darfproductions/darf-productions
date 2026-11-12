// Preguntas frecuentes por obra (0141). La producción solo llena las respuestas de una lista sugerida (y puede agregar
// las suyas). Las ve el elenco en "Mi obra" y DARFY cuando la persona ya entró. Puro, con pruebas en faq-rules.test.ts.
import type { FaqItem } from "@/lib/darfy-rules";

export type FaqObra = { id: string | null; clave: string | null; pregunta: string; respuesta: string; orden: number; activa: boolean };

/** Las 8 preguntas que casi siempre hace el elenco. La clave identifica la sugerencia aunque cambie el texto. */
export const PREGUNTAS_SUGERIDAS: { clave: string; pregunta: string; pista: string }[] = [
  { clave: "ensayos", pregunta: "¿Dónde y a qué hora son los ensayos?", pista: "Lugar, días y horario habitual. Ej. Foro DARF, sábados de 10:00 a 14:00." },
  { clave: "llevar", pregunta: "¿Qué debo llevar a los ensayos?", pista: "Ropa cómoda, agua, libreta, zapatos de baile, partituras…" },
  { clave: "faltas", pregunta: "¿Qué hago si no puedo ir o voy a llegar tarde?", pista: "Con cuánta anticipación avisar y desde dónde (en el portal, en Pedir o avisar)." },
  { clave: "pagos", pregunta: "¿Cuánto y cuándo se paga?", pista: "Inscripción, mensualidad, fecha límite y cómo pagar (transferencia, efectivo)." },
  { clave: "documentos", pregunta: "¿Qué documentos tengo que entregar?", pista: "Reglamento firmado, identificación, permiso de los papás si es menor…" },
  { clave: "funciones", pregunta: "¿Cuándo y dónde son las funciones?", pista: "Fechas, teatro y a qué hora deben llegar los integrantes." },
  { clave: "contacto", pregunta: "¿A quién le escribo si tengo una duda?", pista: "Quién atiende qué: producción, dirección, maestros. En el portal pueden escribirles desde Mi obra." },
  { clave: "reglas", pregunta: "¿Cómo funcionan las advertencias y las faltas?", pista: "Cuántas advertencias hay, qué pasa con retardos y faltas sin avisar." },
];

/** Lo que ve la producción en el editor: primero las sugeridas (con lo guardado si ya lo hay), después las propias. */
export function filasEditor(guardadas: FaqObra[]): FaqObra[] {
  const porClave = new Map(guardadas.filter((f) => f.clave).map((f) => [f.clave as string, f]));
  const sugeridas = PREGUNTAS_SUGERIDAS.map((s, i) => porClave.get(s.clave) ?? { id: null, clave: s.clave, pregunta: s.pregunta, respuesta: "", orden: 10 + i, activa: true });
  const propias = guardadas.filter((f) => !f.clave || !PREGUNTAS_SUGERIDAS.some((s) => s.clave === f.clave)).sort((a, b) => a.orden - b.orden || a.pregunta.localeCompare(b.pregunta));
  return [...sugeridas, ...propias];
}

/** Las que el elenco ve: activas y con respuesta. */
export function respondidas(faqs: FaqObra[]): FaqObra[] {
  return faqs.filter((f) => f.activa && f.respuesta.trim() !== "").sort((a, b) => a.orden - b.orden || a.pregunta.localeCompare(b.pregunta));
}

/** Para DARFY: cada pregunta de la obra como una entrada más, con el nombre de la obra entre sus palabras clave y liga al portal. */
export function faqsParaDarfy(faqs: FaqObra[], pid: string, obra: string): FaqItem[] {
  return respondidas(faqs).map((f) => ({
    id: `obra-${pid}-${f.id ?? f.clave ?? f.orden}`,
    pregunta: f.pregunta,
    respuesta: `${obra}: ${f.respuesta}`,
    palabras: [obra],
    liga: `/cuenta/produccion/${pid}#obra`,
  }));
}

/** Cuántas sugeridas ya tienen respuesta: "3 de 8". */
export function avanceSugeridas(faqs: FaqObra[]): { listas: number; total: number } {
  const claves = new Set(faqs.filter((f) => f.respuesta.trim() !== "").map((f) => f.clave));
  return { listas: PREGUNTAS_SUGERIDAS.filter((s) => claves.has(s.clave)).length, total: PREGUNTAS_SUGERIDAS.length };
}
