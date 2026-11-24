import type { Tablero } from "./CastBoard";
import { SECCIONES } from "./secciones";

// 0168: el cast en filas, por sección (protagonistas, apoyo, grupos de ensamble y ensamble general), para el documento
// y el Excel. Cada fila: sección, personaje o grupo, número y nombre.
export type FilaCast = { seccion: string; personaje: string; numero: number | null; nombre: string; cuenta: boolean };

export function filasCast(t: Tablero): FilaCast[] {
  const filas: FilaCast[] = [];
  for (const [cat, seccion] of SECCIONES) {
    for (const r of t.roles.filter((x) => (x.categoria ?? "protagonista") === cat)) {
      if (!r.asignados.length) filas.push({ seccion, personaje: r.nombre, numero: null, nombre: "", cuenta: true });
      for (const p of r.asignados) filas.push({ seccion, personaje: r.nombre, numero: p.numero, nombre: p.nombre, cuenta: p.cuenta });
    }
  }
  for (const p of t.ensamble) filas.push({ seccion: "Ensamble general", personaje: "Ensamble", numero: p.numero, nombre: p.nombre, cuenta: p.cuenta });
  return filas;
}
