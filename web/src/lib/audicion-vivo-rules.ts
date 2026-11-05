// Día de audiciones en vivo (0131): quién sigue, la fila del callback, el texto del callback y la lista del host
// para elegir a quién llama. Puro, con pruebas en audicion-vivo-rules.test.ts. La base aplica lo mismo
// (audition_siguiente, audition_cerrar_ronda).
import { mayus } from "@/lib/dates";

export type OrdenFila = "llegada" | "registro" | "personaje" | "horario" | "grupo";
export const ORDEN_FILA: { valor: OrdenFila; label: string; ayuda: string; necesita?: "grupo" }[] = [
  { valor: "llegada", label: "Por llegada", ayuda: "Pasa primero quien llegó primero." },
  { valor: "registro", label: "Por registro", ayuda: "En el orden en que se inscribieron." },
  { valor: "horario", label: "Por horario", ayuda: "Primero el horario más temprano; sin horario, al final." },
  { valor: "personaje", label: "Por personaje", ayuda: "Primero el personaje más importante; sin personaje, al final." },
  { valor: "grupo", label: "Por grupo", ayuda: "Por la respuesta a «Grupo» (salón, Grupo A, B…), y dentro de cada grupo por horario.", necesita: "grupo" },
];

export type FilaVivo = {
  id: string; numero: number | null; estado: string;
  checked_in_at: string | null; entered_at: string | null; finished_at: string | null;
  /** 0133: grupo que pasa junto en un turno. */
  grupo?: string | null;
};

/** Quién está en la fila de hoy: en el callback, solo los llamados. */
export function enLaFila<T extends FilaVivo>(rows: T[], fase: string): T[] {
  return fase === "callback" ? rows.filter((r) => r.estado === "callback") : rows;
}

/** Quién pasaría con "Siguiente" (misma regla que audition_siguiente): ya llegó, no ha pasado; primero los números
 *  después del que está en escena y luego los que se saltaron. */
export function quienSigue<T extends FilaVivo>(rows: T[], enEscena: string | null, fase: string): T | null {
  const cur = rows.find((r) => r.id === enEscena);
  const actual = cur?.numero ?? null;
  const listos = enLaFila(rows, fase).filter((r) => r.checked_in_at && !r.finished_at && r.id !== enEscena
    && !(cur?.grupo && r.grupo === cur.grupo) && !["cancelado", "no_cumple"].includes(r.estado));
  const clave = (r: T) => [actual !== null && (r.numero ?? Infinity) < actual ? 1 : 0, r.numero ?? Infinity, Date.parse(r.checked_in_at ?? "") || 0];
  return listos.sort((a, b) => {
    const x = clave(a), y = clave(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  })[0] ?? null;
}

/** Cuántos esperan (llegaron y no han pasado, sin contar a quien está en escena). */
export function esperando(rows: FilaVivo[], enEscena: string | null, fase: string): number {
  return enLaFila(rows, fase).filter((r) => r.checked_in_at && !r.entered_at && !r.finished_at && r.id !== enEscena
    && !["cancelado", "no_cumple"].includes(r.estado)).length;
}

/** 0133: quienes pasan con esta persona (ella incluida), en orden de número; si no va en grupo, solo ella. */
export function companeros<T extends FilaVivo & { nombre: string }>(rows: T[], fila: T): T[] {
  if (!fila.grupo) return [fila];
  return rows.filter((r) => r.grupo === fila.grupo).sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity));
}

/** "Nº 7 · Ana + Caro" para la fila en vivo. */
export function nombreTurno<T extends FilaVivo & { nombre: string }>(rows: T[], fila: T): string {
  const g = companeros(rows, fila);
  const n = g[0].numero ?? fila.numero;
  return `${n ? `Nº ${n} · ` : ""}${g.map((x) => (g.length > 1 ? x.nombre.split(" ")[0] : x.nombre)).join(" + ")}`;
}

/** "Hoy" o "Sábado 8 de noviembre, 10:00 a.m. · Foro DARF". */
export function textoCallback(cuando: "hoy" | "otra_fecha" | null | undefined, fecha: string | null | undefined, lugar: string | null | undefined): string | null {
  if (cuando === "hoy") return "Hoy mismo";
  if (cuando !== "otra_fecha" || !fecha) return null;
  const d = new Date(fecha);
  const dia = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(d);
  const h = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Mexico_City" }).format(d)
    .replace(/\s*a\.?\s*m\.?/i, " a.m.").replace(/\s*p\.?\s*m\.?/i, " p.m.");
  return `${mayus(dia)}, ${h}${lugar?.trim() ? ` · ${lugar.trim()}` : ""}`;
}

export type PersonaCierre = {
  id: string; numero: number | null; nombre: string; estado: string; roles: string[] | null; paso: boolean;
  promedio: number | null; marcas: Record<string, number>;
};
export type GrupoCierre = { id: string; nombre: string; personas: (PersonaCierre & { marcasAqui: number })[] };

/** Para el host: un grupo por personaje con quienes lo quieren o fueron marcados para él (más marcas y mejor
 *  promedio primero), luego Ensamble (si alguien lo marcó) y al final quien no entra en ningún grupo. */
export function gruposCierre(personajes: { id: string; nombre: string }[], personas: PersonaCierre[]): GrupoCierre[] {
  const orden = (aqui: (p: PersonaCierre) => number) => (a: PersonaCierre, b: PersonaCierre) =>
    aqui(b) - aqui(a) || (b.promedio ?? -1) - (a.promedio ?? -1) || (a.numero ?? Infinity) - (b.numero ?? Infinity);
  const usados = new Set<string>();
  const grupos: GrupoCierre[] = [];
  for (const r of personajes) {
    const aqui = (p: PersonaCierre) => p.marcas?.[r.id] ?? 0;
    const lista = personas.filter((p) => (p.roles ?? []).includes(r.id) || aqui(p) > 0).sort(orden(aqui));
    lista.forEach((p) => usados.add(p.id));
    if (lista.length) grupos.push({ id: r.id, nombre: r.nombre, personas: lista.map((p) => ({ ...p, marcasAqui: aqui(p) })) });
  }
  const ens = (p: PersonaCierre) => p.marcas?.ensamble ?? 0;
  const ensamble = personas.filter((p) => ens(p) > 0).sort(orden(ens));
  ensamble.forEach((p) => usados.add(p.id));
  if (ensamble.length) grupos.push({ id: "ensamble", nombre: "Ensamble", personas: ensamble.map((p) => ({ ...p, marcasAqui: ens(p) })) });
  const resto = personas.filter((p) => !usados.has(p.id)).sort(orden(() => 0));
  if (resto.length) grupos.push({ id: "otros", nombre: "Sin personaje", personas: resto.map((p) => ({ ...p, marcasAqui: 0 })) });
  return grupos;
}

/** Fecha mínima válida para el callback (en hora local del navegador, para <input type="datetime-local">). */
export function validarCallback(cuando: string, fecha: string | null, llamados: number, ahora = new Date()): string | null {
  if (!llamados) return "Palomea al menos a una persona.";
  if (cuando !== "hoy" && cuando !== "otra_fecha") return "Elige si el callback es hoy o en otra fecha.";
  if (cuando === "otra_fecha" && (!fecha || Date.parse(fecha) <= ahora.getTime())) return "Pon una fecha y hora que no haya pasado.";
  return null;
}

// ──────── 0136: "¿Con quién pasas?" → grupos sugeridos ────────
export type PersonaCon = { id: string; nombre: string; con: string | null };
export type GrupoSugerido = { ids: string[]; porque: string[] };

const plano = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (s: string) => plano(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !["con", "mis", "los", "las", "del", "por", "para", "hermano", "hermana", "amigo", "amiga", "prima", "primo", "solo", "sola", "nadie"].includes(w));

/** A quién menciona cada quien: coincide si el texto trae el nombre completo, o el nombre de pila y alguna otra
 *  palabra del nombre (apellido), o un nombre de pila que solo una persona tiene. */
export function mencionados(personas: PersonaCon[], p: PersonaCon): string[] {
  if (!p.con) return [];
  const texto = plano(p.con);
  const tokens = new Set(palabras(p.con));
  const pila = new Map<string, number>();
  for (const q of personas) { const n = palabras(q.nombre)[0]; if (n) pila.set(n, (pila.get(n) ?? 0) + 1); }
  const out: string[] = [];
  for (const q of personas) {
    if (q.id === p.id) continue;
    const partes = palabras(q.nombre);
    if (!partes.length) continue;
    const completo = plano(q.nombre).trim();
    const [nombre, ...resto] = partes;
    const hit = (completo && texto.includes(completo))
      || (tokens.has(nombre) && resto.some((r) => tokens.has(r)))
      || (tokens.has(nombre) && pila.get(nombre) === 1);
    if (hit) out.push(q.id);
  }
  return out;
}

/** Grupos sugeridos: quien menciona a alguien y quienes son mencionados quedan juntos (uniendo cadenas: si Ana
 *  menciona a Beto y Beto a Caro, van los tres). Solo grupos de 2 o más; cada quien en un solo grupo. */
export function sugerirGrupos(personas: PersonaCon[]): GrupoSugerido[] {
  const padre = new Map<string, string>(personas.map((p) => [p.id, p.id]));
  const raiz = (x: string): string => { let r = x; while (padre.get(r) !== r) r = padre.get(r)!; padre.set(x, r); return r; };
  const unir = (a: string, b: string) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) padre.set(ra, rb); };
  const porque = new Map<string, string[]>();
  const nombreDe = new Map(personas.map((p) => [p.id, p.nombre]));
  for (const p of personas) {
    const m = mencionados(personas, p);
    for (const id of m) {
      unir(p.id, id);
      const k = raiz(p.id);
      porque.set(k, [...(porque.get(k) ?? []), `${p.nombre.split(" ")[0]} dijo: «${p.con}»`]);
    }
  }
  const grupos = new Map<string, string[]>();
  for (const p of personas) { const r = raiz(p.id); grupos.set(r, [...(grupos.get(r) ?? []), p.id]); }
  return [...grupos.entries()].filter(([, ids]) => ids.length >= 2).map(([r, ids]) => ({
    ids: ids.sort((a, b) => (nombreDe.get(a) ?? "").localeCompare(nombreDe.get(b) ?? "")),
    porque: [...new Set([...porque.values()].flat().filter((x) => ids.some((id) => x.startsWith(`${(nombreDe.get(id) ?? "").split(" ")[0]} dijo`))))].slice(0, 4),
  })).filter((g) => g.ids.length >= 2);
}
