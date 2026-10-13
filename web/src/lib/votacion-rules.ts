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

/**
 * Propuesta de cast. `roles` en orden de importancia (el primero es el más importante).
 * Gana quien tenga más votos (>0); empates, todos. Quien ya quedó en uno más importante se salta
 * (sin pasar al segundo lugar). Ensamble: marcados para ensamble que no quedaron en un personaje.
 */
export function propuesta(roles: string[], votos: Voto[], ensamble: string[] = []): { porRol: Record<string, string[]>; ensamble: string[] } {
  const asignado = new Set<string>();
  const porRol: Record<string, string[]> = {};
  for (const r of roles) {
    const cuenta = new Map<string, number>();
    for (const v of votos) if (v.role === r && v.app) cuenta.set(v.app, (cuenta.get(v.app) ?? 0) + 1);
    const max = Math.max(0, ...cuenta.values());
    porRol[r] = max === 0 ? [] : [...cuenta].filter(([app, n]) => n === max && !asignado.has(app)).map(([app]) => app).sort();
    for (const a of porRol[r]) asignado.add(a);
  }
  return { porRol, ensamble: [...new Set(ensamble)].filter((a) => !asignado.has(a)).sort() };
}

/** Resumen antes de "Mandar". */
export function resumenEnvio(cast: { cuenta: boolean }[], fuera: { cuenta: boolean }[]) {
  const ofertas = cast.filter((c) => c.cuenta).length;
  const sinCuenta = cast.length - ofertas;
  const avisos = fuera.filter((f) => f.cuenta).length;
  const partes = [`${ofertas} ${ofertas === 1 ? "oferta" : "ofertas"}`, `${avisos} ${avisos === 1 ? "aviso" : "avisos"} de "no quedaste"`];
  return { ofertas, sinCuenta, avisos, texto: `Se mandarán ${partes.join(" y ")}${sinCuenta ? `; ${sinCuenta} sin cuenta (avísales tú)` : ""}.` };
}
