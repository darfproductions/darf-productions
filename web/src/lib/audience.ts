// A quién va un material, un comunicado o un ensayo: todo el elenco, grupos o personas.
// Puro (con pruebas). La base vuelve a revisar quién lo recibe.

import { TIPO_CREDITO } from "@/lib/casting-rules";

export type Audience = { audiencia: "todos" | "grupos" | "personas"; grupos: string[]; personas: string[] };

export function parseAudience(f: FormData, prefix = ""): Audience | { error: string } {
  const raw = String(f.get(`${prefix}audiencia`) ?? "todos");
  const audiencia = (["todos", "grupos", "personas"].includes(raw) ? raw : "todos") as Audience["audiencia"];
  const grupos = f.getAll(`${prefix}grupos`).map(String).filter((g) => g in TIPO_CREDITO);
  const personas = f.getAll(`${prefix}personas`).map(String).filter(Boolean);
  if (audiencia === "grupos" && !grupos.length) return { error: "Marca al menos un grupo." };
  if (audiencia === "personas" && !personas.length) return { error: "Marca al menos a una persona." };
  return { audiencia, grupos: audiencia === "grupos" ? grupos : [], personas: audiencia === "personas" ? personas : [] };
}

export function audienceLabel(a: Audience, nombres: Map<string, string> = new Map()): string {
  if (a.audiencia === "grupos") return a.grupos.map((g) => TIPO_CREDITO[g] ?? g).join(" y ");
  if (a.audiencia === "personas") return a.personas.map((p) => nombres.get(p) ?? "—").join(", ");
  return "Todo el elenco";
}
