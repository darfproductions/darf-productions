import QRCode from "qrcode";
import type { FichaAudicion } from "@/lib/produccion-nueva-rules";
import { mayus } from "@/lib/dates";
import type { KitColumns } from "@/lib/themes";
import { supabase } from "~/lib/supabase";

// Audiciones (0036, 0037, 0064, 0097, 0135): las mismas lecturas que web/src/lib/auditions.ts, pero con el cliente de la
// app (la sesión de quien la usa). RLS decide qué se ve: convocatorias públicas y, de cada aspirante, solo lo suyo.
// Los tipos son copia de los de auditions.ts (ese archivo usa el cliente del servidor y no se puede importar aquí).

export type Audition = {
  id: string; permanente?: boolean; production_id: string | null; productions: { nombre: string } | null;
  pedir_tutor: boolean; pedir_foto: boolean; elegir_horario: boolean; visibilidad: "publica" | "enlace";
  numeracion: "llegada" | "previa" | "personaje"; numeros_asignados_at?: string | null; modalidad: "presencial" | "en_linea" | "mixta";
  solo_invitados: boolean; titulo: string; descripcion: string | null; requisitos: string | null; sede: string | null; estado: string;
  inscripcion_cierra: string | null; edad_min: number | null; edad_max: number | null; perfil_preguntas?: string[];
};
export type AuditionRole = { id: string; nombre: string; descripcion: string | null; orden: number };
export type AuditionField = { id: string; etiqueta: string; tipo: "texto" | "parrafo" | "enlace" | "opcion" | "si_no"; opciones: string[] | null; obligatorio: boolean; orden: number };
export type AuditionSlot = { id: string; inicia: string; termina?: string | null; sala: string | null; cupo: number; ocupados: number };
export type AuditionObra = KitColumns & { nombre: string; publica: boolean };
export type MyInvite = { audition_id: string; titulo: string; obra: string | null; inscripcion_cierra: string | null; inscrito: boolean };
export type MyApplication = {
  id: string; audition_id: string; estado: string; nombre: string; telefono: string; fecha_nacimiento: string; slot_id: string | null;
  roles: string[]; respuestas: Record<string, string>; tutor_nombre: string | null; tutor_telefono: string | null; tutor_email: string | null;
  consentimiento_imagen: boolean; foto_path: string | null; qr_token: string; numero: number | null; checked_in_at: string | null;
  completar_pedido_at?: string | null; completar_nota?: string | null;
  perfil_tesitura?: string | null; perfil_canto?: string | null; perfil_baile?: string | null; perfil_genero?: string | null; perfil_habilidades?: string[];
  auditions: { titulo: string; estado: string; fase?: string; callback_cuando?: "hoy" | "otra_fecha" | null; callback_fecha?: string | null; callback_lugar?: string | null; numeracion?: string; numeros_asignados_at?: string | null } | null;
  audition_slots: { inicia: string; sala: string | null } | null;
};

/** "Hoy mismo" o "Sábado 8 de noviembre, 10:00 a.m. · Foro DARF" (igual que audicion-vivo-rules.ts). */
export function textoCallback(cuando: "hoy" | "otra_fecha" | null | undefined, fecha: string | null | undefined, lugar: string | null | undefined): string | null {
  if (cuando === "hoy") return "Hoy mismo";
  if (cuando !== "otra_fecha" || !fecha) return null;
  const d = new Date(fecha);
  const dia = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(d);
  const h = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Mexico_City" }).format(d)
    .replace(/\s*a\.?\s*m\.?/i, " a.m.").replace(/\s*p\.?\s*m\.?/i, " p.m.");
  return `${mayus(dia)}, ${h}${lugar?.trim() ? ` · ${lugar.trim()}` : ""}`;
}

const COLS =
  "id, production_id, titulo, descripcion, requisitos, sede, estado, inscripcion_cierra, edad_min, edad_max, pedir_tutor, pedir_foto, elegir_horario, visibilidad, numeracion, numeros_asignados_at, modalidad, solo_invitados, permanente, perfil_preguntas, productions(nombre)";
const MY_COLS =
  "id, audition_id, estado, nombre, telefono, fecha_nacimiento, slot_id, roles, respuestas, tutor_nombre, tutor_telefono, tutor_email, consentimiento_imagen, foto_path, qr_token, numero, checked_in_at, completar_pedido_at, completar_nota, perfil_tesitura, perfil_canto, perfil_baile, perfil_genero, perfil_habilidades, auditions!audition_applications_audition_id_fkey(titulo, estado, fase, callback_cuando, callback_fecha, callback_lugar, numeracion, numeros_asignados_at), audition_slots(inicia, sala)";

export function formatSlot(iso: string, termina?: string | null): string {
  const texto = mayus(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));
  if (!termina) return texto;
  return `${texto} a ${new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(termina))}`;
}

/** 0140: el turno se ve cuando ya se repartieron los números o al llegar. */
export function numeroVisible(a: MyApplication): number | null {
  if (!a.numero) return null;
  return a.checked_in_at || a.auditions?.numeros_asignados_at ? a.numero : null;
}

async function obraDe(aid: string): Promise<AuditionObra | null> {
  const { data } = await supabase.rpc("audition_obra", { aid });
  return (data as AuditionObra | null) ?? null;
}

export async function leerAudiciones(uid: string | null) {
  const [lista, perm, mias, invit] = await Promise.all([
    supabase.from("auditions").select(COLS).in("estado", ["abierta", "cerrada"]).eq("visibilidad", "publica").eq("permanente", false).order("created_at", { ascending: false }),
    supabase.from("auditions").select("id, titulo, requisitos").eq("permanente", true).eq("estado", "abierta").maybeSingle(),
    uid ? supabase.from("audition_applications").select(MY_COLS).eq("user_id", uid).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    uid ? supabase.rpc("my_audition_invites") : Promise.resolve({ data: [] }),
  ]);
  const convocatorias = await Promise.all(((lista.data ?? []) as unknown as Audition[]).map(async (a) => {
    if (!a.production_id || a.productions) return a;
    const obra = await obraDe(a.id);
    return obra ? { ...a, productions: { nombre: obra.nombre } } : a;
  }));
  return {
    convocatorias,
    permanente: (perm.data as { id: string; titulo: string; requisitos: string | null } | null) ?? null,
    mias: (mias.data ?? []) as unknown as MyApplication[],
    invitaciones: ((invit.data ?? []) as MyInvite[]).filter((i) => !i.inscrito),
  };
}

export type DetalleAudicion = {
  a: Audition; roles: AuditionRole[]; fields: AuditionField[]; slots: AuditionSlot[];
  obra: AuditionObra | null; fichas: FichaAudicion[]; mia: MyApplication | null; invitacion: boolean; qr: string | null;
};

export async function leerAudicion(id: string, uid: string | null): Promise<DetalleAudicion | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [a, roles, fields, slots, fichas, mia, inv] = await Promise.all([
    supabase.from("auditions").select(COLS).eq("id", id).maybeSingle(),
    supabase.from("audition_roles").select("id, nombre, descripcion, orden").eq("audition_id", id).order("orden"),
    supabase.from("audition_fields").select("id, etiqueta, tipo, opciones, obligatorio, orden").eq("audition_id", id).order("orden"),
    supabase.rpc("audition_slot_availability", { aid: id }),
    supabase.rpc("audition_fichas", { aid: id }),
    uid ? supabase.from("audition_applications").select(MY_COLS).eq("audition_id", id).eq("user_id", uid).maybeSingle() : Promise.resolve({ data: null }),
    uid ? supabase.rpc("audition_am_invited", { aid: id }) : Promise.resolve({ data: false }),
  ]);
  if (!a.data) return null;
  const aud = a.data as unknown as Audition;
  const obra = aud.production_id ? await obraDe(aud.id) : null;
  const m = (mia.data as unknown as MyApplication | null) ?? null;
  const conQr = m && aud.estado !== "cancelada" && !m.checked_in_at && !["cancelado", "no_cumple"].includes(m.estado);
  return {
    a: aud, obra, mia: m, invitacion: inv.data === true,
    roles: (roles.data ?? []) as AuditionRole[],
    fields: (fields.data ?? []) as AuditionField[],
    slots: (slots.data ?? []) as AuditionSlot[],
    fichas: (fichas.data ?? []) as FichaAudicion[],
    qr: conQr ? await QRCode.toDataURL(m.qr_token, { margin: 1, width: 480 }) : null,
  };
}
