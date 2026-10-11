import { createClient } from "@/lib/supabase/server";

// Lecturas de audiciones (0036). Pasan por RLS: el público ve convocatorias
// abiertas, cerradas o finalizadas; cada aspirante, solo su inscripción.

export type Audition = {
  id: string;
  production_id: string;
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

const COLS = "id, production_id, titulo, descripcion, requisitos, sede, estado, inscripcion_cierra, edad_min, edad_max";

export async function listPublicAuditions(): Promise<Audition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select(COLS).in("estado", ["abierta", "cerrada"]).order("created_at", { ascending: false });
  return (data ?? []) as Audition[];
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
    audition: a.data as Audition,
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
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
}
