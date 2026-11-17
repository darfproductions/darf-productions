import { ageAt } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import type { ListaApp } from "@/lib/lista-audicion-rules";
import { createClient } from "@/lib/supabase/server";

type Fila = {
  id: string; numero: number | null; nombre: string; fecha_nacimiento: string | null; estado: string; roles: string[] | null;
  audition_slots: { inicia: string; termina: string | null; sala: string | null } | null;
};

/** Inscritos para la lista impresa y el Excel: turno, edad, personajes, grupo y con quién pasa.
 *  Sin canceladas ni «no cumple». Quien llama ya revisó audiciones.gestionar. */
export async function cargarLista(aid: string): Promise<ListaApp[]> {
  const supabase = await createClient();
  const [{ data: apps }, { data: roles }, { data: grupos }, { data: sistema }] = await Promise.all([
    supabase.from("audition_applications").select("id, numero, nombre, fecha_nacimiento, estado, roles, audition_slots(inicia, termina, sala)")
      .eq("audition_id", aid).not("estado", "in", "(cancelado,no_cumple)"),
    supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden"),
    supabase.rpc("audition_grupos", { aid }),
    supabase.rpc("audition_respuestas_sistema", { aid }),
  ]);
  const rol = new Map(((roles ?? []) as { id: string; nombre: string }[]).map((r, i) => [r.id, { nombre: r.nombre, i }]));
  const turno = new Map(((grupos ?? []) as { id: string; grupo_turno: string }[]).map((g) => [g.id, g.grupo_turno]));
  const resp = new Map(((sistema ?? []) as { id: string; grupo: string | null; companeros: string | null }[]).map((x) => [x.id, x]));
  const hoy = new Date();
  return ((apps ?? []) as unknown as Fila[]).map((a) => {
    const s = a.audition_slots;
    return {
      id: a.id, numero: a.numero, nombre: a.nombre, estado: a.estado,
      edad: a.fecha_nacimiento ? ageAt(a.fecha_nacimiento, hoy) : null,
      horario: s ? `${formatSlot(s.inicia, s.termina)}${s.sala ? ` · ${s.sala}` : ""}` : null,
      // En el orden de los personajes de la convocatoria.
      personajes: (a.roles ?? []).filter((r) => rol.has(r)).sort((x, y) => rol.get(x)!.i - rol.get(y)!.i).map((r) => rol.get(r)!.nombre),
      grupo: resp.get(a.id)?.grupo ?? null,
      conRespuesta: resp.get(a.id)?.companeros ?? null,
      grupoTurno: turno.get(a.id) ?? null,
    };
  });
}
