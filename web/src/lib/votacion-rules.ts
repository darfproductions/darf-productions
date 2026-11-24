// Audiciones con votación (0089): fases y la propuesta de cast con las reglas de Diego.
// Funciones puras (votacion-rules.test.ts). La base aplica las mismas reglas (_audition_propuesta).

export type Fase = "audicion" | "seleccion_callback" | "callback" | "votacion" | "ajuste" | "enviado";

export const FASE_LABEL: Record<Fase, string> = {
  audicion: "Audición",
  seleccion_callback: "Elegir callback",
  callback: "Callback",
  votacion: "Votación",
  ajuste: "Ajuste del cast",
  enviado: "Enviado",
};

/** Etapas en orden según si hay callback. */
export function fasesDe(conCallback: boolean): Fase[] {
  return conCallback
    ? ["audicion", "seleccion_callback", "callback", "votacion", "ajuste", "enviado"]
    : ["audicion", "votacion", "ajuste", "enviado"];
}

export function siguienteFase(fase: Fase, conCallback: boolean): Fase | null {
  if (fase === "ajuste" || fase === "enviado") return null; // de ajuste se sale con "Mandar"
  const f = fasesDe(conCallback);
  return f[f.indexOf(fase) + 1] ?? null;
}

export function anteriorFase(fase: Fase, conCallback: boolean): Fase | null {
  if (fase === "enviado" || fase === "audicion") return null;
  const f = fasesDe(conCallback);
  return f[f.indexOf(fase) - 1] ?? null;
}

/** Ronda en la que los jueces marcan opciones según la fase (2 = callback). */
export function rondaDeFase(fase: Fase): 1 | 2 {
  return fase === "callback" ? 2 : 1;
}

/** Texto del botón para avanzar. */
export function botonSiguiente(fase: Fase, conCallback: boolean): string | null {
  const s = siguienteFase(fase, conCallback);
  if (!s) return null;
  return fase === "votacion" ? "Cerrar votación y ver la propuesta" : `Siguiente: ${FASE_LABEL[s]}`;
}

type Voto = { role: string; app: string | null };
/** Para desempatar: «Opción 1» de los jueces por personaje y persona, promedio de calificaciones y número de turno. */
export type Desempate = { op1?: Record<string, Record<string, number>>; prom?: Record<string, number>; numero?: Record<string, number> };

/**
 * Propuesta de cast (0167, la misma regla que _audition_propuesta). `roles` en orden de importancia.
 * Gana el más votado (>0). Empate: más «Opción 1» de los jueces, luego mejor promedio, luego número de turno, y se
 * anota para la junta. Si el más votado ya quedó en uno más importante, pasa al siguiente más votado (y se anota).
 * Ensamble: marcados para ensamble que no quedaron en un personaje.
 */
export function propuesta(roles: string[], votos: Voto[], ensamble: string[] = [], d: Desempate = {}):
  { porRol: Record<string, string[]>; ensamble: string[]; notas: Record<string, { saltados: string[]; empate: string[] }> } {
  const asignado = new Map<string, string>();
  const porRol: Record<string, string[]> = {};
  const notas: Record<string, { saltados: string[]; empate: string[] }> = {};
  for (const r of roles) {
    const cuenta = new Map<string, number>();
    for (const v of votos) if (v.role === r && v.app) cuenta.set(v.app, (cuenta.get(v.app) ?? 0) + 1);
    const op1 = (a: string) => d.op1?.[r]?.[a] ?? 0;
    const ranking = [...cuenta].sort(([a, x], [b, y]) => y - x || op1(b) - op1(a) || (d.prom?.[b] ?? -1) - (d.prom?.[a] ?? -1)
      || (d.numero?.[a] ?? 1e9) - (d.numero?.[b] ?? 1e9) || a.localeCompare(b));
    const saltados: string[] = [];
    let gana: [string, number] | null = null;
    const empate: string[] = [];
    for (const [app, n] of ranking) {
      if (asignado.has(app)) { if (!gana) saltados.push(app); continue; }
      if (!gana) { gana = [app, n]; continue; }
      if (n === gana[1]) empate.push(app);
    }
    porRol[r] = gana ? [gana[0]] : [];
    if (gana) asignado.set(gana[0], r);
    if (saltados.length || empate.length) notas[r] = { saltados, empate };
  }
  return { porRol, ensamble: [...new Set(ensamble)].filter((a) => !asignado.has(a)).sort(), notas };
}

/** Resumen antes de "Mandar". */
export function resumenEnvio(cast: { cuenta: boolean }[], fuera: { cuenta: boolean }[]) {
  const ofertas = cast.filter((c) => c.cuenta).length;
  const sinCuenta = cast.length - ofertas;
  const avisos = fuera.filter((f) => f.cuenta).length;
  const partes = [`${ofertas} ${ofertas === 1 ? "oferta" : "ofertas"}`, `${avisos} ${avisos === 1 ? "aviso" : "avisos"} de "no quedaste"`];
  return { ofertas, sinCuenta, avisos, texto: `Se mandarán ${partes.join(" y ")}${sinCuenta ? `; ${sinCuenta} sin cuenta (avísales tú)` : ""}.` };
}
