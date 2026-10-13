import { createClient } from "@/lib/supabase/server";
import { mayus } from "@/lib/dates";
import type { KitColumns } from "@/lib/themes";

// Lecturas de audiciones (0036, 0037). Pasan por RLS: el público ve convocatorias
// abiertas, cerradas o finalizadas; cada aspirante, solo su inscripción. Las de
// "solo con enlace" no salen en la lista, pero se abren con su dirección.

export type Audition = {
  id: string;
  permanente?: boolean;
  production_id: string | null;
  productions: { nombre: string } | null;
  pedir_tutor: boolean;
  pedir_foto: boolean;
  elegir_horario: boolean;
  visibilidad: "publica" | "enlace";
  numeracion: "llegada" | "previa";
  modalidad: "presencial" | "en_linea" | "mixta";
  solo_invitados: boolean;
  titulo: string;
  descripcion: string | null;
  requisitos: string | null;
  sede: string | null;
  estado: string;
  inscripcion_cierra: string | null;
  edad_min: number | null;
  edad_max: number | null;
};
export type AuditionRole = { id: string; nombre: string; descripcion: string | null; orden: number };
export type AuditionField = { id: string; etiqueta: string; tipo: "texto" | "parrafo" | "enlace" | "opcion" | "si_no"; opciones: string[] | null; obligatorio: boolean; orden: number };
export type AuditionSlot = { id: string; inicia: string; sala: string | null; cupo: number; ocupados: number };

const COLS =
  "id, production_id, titulo, descripcion, requisitos, sede, estado, inscripcion_cierra, edad_min, edad_max, pedir_tutor, pedir_foto, elegir_horario, visibilidad, numeracion, modalidad, solo_invitados, permanente, productions(nombre)";

export async function listPublicAuditions(): Promise<Audition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select(COLS).in("estado", ["abierta", "cerrada"]).eq("visibilidad", "publica").eq("permanente", false).order("created_at", { ascending: false });
  const lista = (data ?? []) as unknown as Audition[];
  // Obra privada (borrador u oculta): RLS no deja leerla; su nombre sale de audition_obra (0097).
  return Promise.all(lista.map(async (a) => {
    if (!a.production_id || a.productions) return a;
    const obra = await getAuditionObra(a.id);
    return obra ? { ...a, productions: { nombre: obra.nombre } } : a;
  }));
}

/** 0097: nombre y kit de la obra de una convocatoria pública, aunque la obra sea privada.
 *  "publica" dice si su página se puede abrir. */
export type AuditionObra = KitColumns & { nombre: string; publica: boolean };
export async function getAuditionObra(aid: string): Promise<AuditionObra | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("audition_obra", { aid });
  return (data as AuditionObra | null) ?? null;
}

/** El Registro permanente de talento (0064), si está abierto. */
export async function getPermanentRegistry(): Promise<{ id: string; titulo: string; requisitos: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select("id, titulo, requisitos").eq("permanente", true).eq("estado", "abierta").maybeSingle();
  return data ?? null;
}

/** Convocatorias abiertas y públicas de una obra (aviso en su página). */
export async function listOpenAuditionsFor(pid: string): Promise<{ id: string; titulo: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select("id, titulo, inscripcion_cierra")
    .eq("production_id", pid).eq("estado", "abierta").eq("visibilidad", "publica").order("created_at", { ascending: false });
  const now = Date.now();
  return (data ?? []).filter((a) => !a.inscripcion_cierra || new Date(a.inscripcion_cierra as string).getTime() > now).map((a) => ({ id: a.id as string, titulo: a.titulo as string }));
}

export async function getAudition(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const [a, roles, fields, slots] = await Promise.all([
    supabase.from("auditions").select(COLS).eq("id", id).maybeSingle(),
    supabase.from("audition_roles").select("id, nombre, descripcion, orden").eq("audition_id", id).order("orden"),
    supabase.from("audition_fields").select("id, etiqueta, tipo, opciones, obligatorio, orden").eq("audition_id", id).order("orden"),
    supabase.rpc("audition_slot_availability", { aid: id }),
  ]);
  if (!a.data) return null;
  return {
    audition: a.data as unknown as Audition,
    roles: (roles.data ?? []) as AuditionRole[],
    fields: (fields.data ?? []) as AuditionField[],
    slots: (slots.data ?? []) as AuditionSlot[],
  };
}

export type MyApplication = {
  id: string;
  audition_id: string;
  estado: string;
  nombre: string;
  telefono: string;
  fecha_nacimiento: string;
  slot_id: string | null;
  roles: string[];
  respuestas: Record<string, string>;
  tutor_nombre: string | null;
  tutor_telefono: string | null;
  tutor_email: string | null;
  consentimiento_imagen: boolean;
  foto_path: string | null;
  qr_token: string;
  numero: number | null;
  checked_in_at: string | null;
  auditions: { titulo: string; estado: string } | null;
  audition_slots: { inicia: string; sala: string | null } | null;
};

const MY_COLS =
  "id, audition_id, estado, nombre, telefono, fecha_nacimiento, slot_id, roles, respuestas, tutor_nombre, tutor_telefono, tutor_email, consentimiento_imagen, foto_path, qr_token, numero, checked_in_at, auditions(titulo, estado), audition_slots(inicia, sala)";

export async function getMyApplication(auditionId: string, userId: string): Promise<MyApplication | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("audition_applications").select(MY_COLS).eq("audition_id", auditionId).eq("user_id", userId).maybeSingle();
  return (data as unknown as MyApplication) ?? null;
}

export async function listMyApplications(userId: string): Promise<MyApplication[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("audition_applications").select(MY_COLS).eq("user_id", userId).order("created_at", { ascending: false });
  return (data ?? []) as unknown as MyApplication[];
}

export function formatSlot(iso: string): string {
  return mayus(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));
}

export type MyInvite = { audition_id: string; titulo: string; obra: string | null; inscripcion_cierra: string | null; inscrito: boolean };

/** Invitaciones a convocatorias abiertas (0038). Si la base aún no la tiene, no hay ninguna. */
export async function listMyInvites(): Promise<MyInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_audition_invites");
  return (data ?? []) as MyInvite[];
}

/** ¿Me invitaron a esta convocatoria? */
export async function amInvited(aid: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("audition_am_invited", { aid });
  return data === true;
}
