// Buscador del panel (0085). Funciones puras: panel-buscar-rules.test.ts.

export type Resultado = { tipo: string; titulo: string; detalle: string; href: string };
/** Atajo local (obra + sección o sección general): se busca sin ir a la base. */
export type Atajo = Resultado & { claves: string };

/** Minúsculas y sin acentos. */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** ¿Parece un código de orden? (DARF-XXXXXX o EV-XXXXXX, completo o empezado) */
export function esCodigo(q: string): boolean {
  return /^(darf|ev)-[0-9a-z]*$/i.test(q.trim());
}

/** Atajos que contienen todas las palabras; primero los que empiezan igual y, si empatan, en el orden
 *  de la lista (el de las pestañas). */
export function buscarAtajos(atajos: Atajo[], q: string, max = 8): Atajo[] {
  const palabras = normalizar(q).split(" ").filter(Boolean);
  if (!palabras.length) return [];
  return atajos
    .map((a) => ({ a, k: normalizar(a.claves) }))
    .filter(({ k }) => palabras.every((p) => k.includes(p)))
    .map(({ a, k }, i) => ({ a, puntos: (k.startsWith(palabras[0]) ? 0 : 1000) + i }))
    .sort((x, y) => x.puntos - y.puntos)
    .slice(0, max)
    .map(({ a }) => a);
}

export const TIPO_RESULTADO: Record<string, string> = {
  seccion: "Sección", obra: "Obra", persona: "Persona", orden: "Orden de boletos", orden_evento: "Orden de evento", convocatoria: "Convocatoria", evento: "Evento",
};
