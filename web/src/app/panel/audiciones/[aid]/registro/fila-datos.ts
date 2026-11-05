import { companeros, enLaFila, esperando, quienSigue, textoCallback } from "@/lib/audicion-vivo-rules";
import type { PanelAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { formatSlot } from "@/lib/auditions";

export type FilaRow = {
  id: string; numero: number | null; nombre: string; slot_id: string | null; slot_inicia: string | null; sala: string | null; estado: string;
  walk_in: boolean; es_menor: boolean; checked_in_at: string | null; entered_at: string | null; finished_at: string | null;
  grupo?: string | null;
};
export type Turno = { id: string; numero: number | null; nombre: string } | null;

/** La fila del día (0131–0136), compartida por Día de la audición y Modo audición: quién está en escena, quién sigue,
 *  cuántos esperan, los grupos de turno y las respuestas de "¿con quién pasas?". */
export async function cargarFila(aid: string, a: Pick<PanelAudition, "fase" | "en_escena" | "callback_cuando" | "callback_fecha" | "callback_lugar">) {
  const supabase = await createClient();
  const [{ data, error }, { data: gruposData }, { data: sistemaData }, { data: camposSistema }, { data: slotsData }] = await Promise.all([
    supabase.rpc("audition_day_list", { aid }),
    supabase.rpc("audition_grupos", { aid }),
    supabase.rpc("audition_respuestas_sistema", { aid }),
    supabase.from("audition_fields").select("sistema").eq("audition_id", aid).not("sistema", "is", null),
    supabase.from("audition_slots").select("id, inicia, termina, sala").eq("audition_id", aid).order("inicia"),
  ]);
  // 0140: los horarios de la convocatoria (con hora de fin) para asignarlos por persona o por grupo desde la fila.
  const horarios = ((slotsData ?? []) as { id: string; inicia: string; termina: string | null; sala: string | null }[])
    .map((h) => ({ ...h, texto: `${formatSlot(h.inicia, h.termina)}${h.sala ? ` · ${h.sala}` : ""}` }));
  const conQuien = new Map(((sistemaData ?? []) as { id: string; companeros: string | null }[]).map((x) => [x.id, x.companeros]));
  // 0140: la respuesta a «Grupo» (opción) de cada quien, para verla en la fila.
  const grupoResp = new Map(((sistemaData ?? []) as { id: string; grupo: string | null }[]).map((x) => [x.id, x.grupo]));
  const preguntaCon = ((camposSistema ?? []) as { sistema: string }[]).some((x) => x.sistema === "companeros");
  const preguntaGrupo = ((camposSistema ?? []) as { sistema: string }[]).some((x) => x.sistema === "grupo");
  const grupoDe = new Map(((gruposData ?? []) as { id: string; grupo_turno: string }[]).map((g) => [g.id, g.grupo_turno]));
  const todos = enLaFila(((data ?? []) as FilaRow[]).map((r) => ({ ...r, grupo: grupoDe.get(r.id) ?? null })), a.fase);
  const enEscena = a.en_escena ?? null;
  const turno = (r: FilaRow | null): Turno => {
    if (!r) return null;
    const g = companeros(todos, r);
    return { id: r.id, numero: g[0].numero ?? r.numero, nombre: g.map((x) => (g.length > 1 ? x.nombre.split(" ")[0] : x.nombre)).join(" + ") };
  };
  const actual = turno(todos.find((r) => r.id === enEscena) ?? null);
  const sigue = turno(quienSigue(todos, enEscena, a.fase));
  const esperan = esperando(todos, enEscena, a.fase);
  const cb = a.fase === "callback" ? textoCallback(a.callback_cuando, a.callback_fecha, a.callback_lugar) : null;
  const paraGrupos = todos.filter((r) => !r.entered_at && !["cancelado", "no_cumple"].includes(r.estado))
    .map((r) => ({ id: r.id, numero: r.numero, nombre: r.nombre, llego: !!r.checked_in_at, grupo: r.grupo ?? null, con: preguntaCon ? (conQuien.get(r.id) ?? null) : undefined }));
  // Los grupos (respuesta a «Grupo») con cuántos son y qué horarios tienen, para "Horario por grupo".
  const porGrupo = new Map<string, { nombre: string; personas: number; horarios: Set<string> }>();
  for (const r of todos) {
    const g = grupoResp.get(r.id)?.trim();
    if (!g || ["cancelado", "no_cumple"].includes(r.estado)) continue;
    const v = porGrupo.get(g.toLowerCase()) ?? { nombre: g, personas: 0, horarios: new Set<string>() };
    v.personas++;
    const h = horarios.find((x) => x.id === r.slot_id);
    if (h) v.horarios.add(h.texto);
    porGrupo.set(g.toLowerCase(), v);
  }
  const gruposHorario = [...porGrupo.values()].map((g) => ({ nombre: g.nombre, personas: g.personas, horarios: [...g.horarios] }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es", { numeric: true }));
  return { todos, error, enEscena, actual, sigue, esperan, cb, preguntaCon, preguntaGrupo, conQuien, grupoResp, paraGrupos, horarios, gruposHorario };
}
