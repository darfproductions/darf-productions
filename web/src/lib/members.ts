import type { DocType, Enrollment, Fee, FeeTerms, MemberDoc, MemberFile, Payment, PersonFile } from "@/lib/member-rules";
import { createClient } from "@/lib/supabase/server";

// Lecturas del expediente (0041, 0042). Pasan por RLS: el integrante solo ve lo suyo; la
// producción, según expedientes.ver, mensualidades.gestionar y el registro de incidencias.

export type Incident = {
  id: string; tipo: string; nivel: string; descripcion: string; fecha: string; origen: string;
  anulada_at: string | null; anulada_motivo: string | null; created_at: string;
};
export type Measure = { id: string; medida: string; descripcion: string | null; fecha: string };

export type MemberData = {
  person: PersonFile | null; member: MemberFile | null; terms: FeeTerms;
  tipos: DocType[]; docs: (MemberDoc & { id: string })[];
  fee: Fee | null; pagos: (Payment & { id: string; folio: string; metodo: string; nota: string | null; registrado_at: string; concepto: "mensualidad" | "inscripcion"; anulado_at: string | null; motivo_anulacion: string | null })[];
  incidencias: Incident[]; medidas: Measure[]; limite: number; alta: Enrollment | null;
};

export async function getMemberData(pid: string, uid: string): Promise<MemberData> {
  const supabase = await createClient();
  const [person, member, tipos, docs, fee, pagos, terms, inc, med, disc, alta] = await Promise.all([
    supabase.from("person_files").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("member_files").select("revisado_at, confirmado_at").eq("production_id", pid).eq("user_id", uid).maybeSingle(),
    supabase.from("member_doc_types").select("id, nombre, solo_menores, obligatorio, aplica, grupo, personas, descripcion").eq("production_id", pid).order("orden").order("nombre"),
    supabase.from("member_docs").select("id, doc_type_id, archivo_path, subido_at, entregado_at").eq("production_id", pid).eq("user_id", uid),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite, cobrar, inscripcion").eq("production_id", pid).maybeSingle(),
    supabase.from("member_payments").select("id, folio, periodo, monto, metodo, nota, registrado_at, concepto, anulado_at, motivo_anulacion").eq("production_id", pid).eq("user_id", uid).order("periodo"),
    supabase.from("member_fee_terms").select("beca, cuota_especial, sin_inscripcion").eq("production_id", pid).eq("user_id", uid).maybeSingle(),
    supabase.from("member_incidents").select("id, tipo, nivel, descripcion, fecha, origen, anulada_at, anulada_motivo, created_at").eq("production_id", pid).eq("user_id", uid).order("fecha", { ascending: false }),
    supabase.from("member_measures").select("id, medida, descripcion, fecha").eq("production_id", pid).eq("user_id", uid).order("fecha", { ascending: false }),
    supabase.from("production_discipline").select("limite_advertencias").eq("production_id", pid).maybeSingle(),
    supabase.from("member_enrollment").select("ingreso, baja_at, baja_motivo").eq("production_id", pid).eq("user_id", uid).maybeSingle(),
  ]);
  return {
    person: (person.data as PersonFile) ?? null,
    member: (member.data as MemberFile) ?? null,
    terms: (terms.data as FeeTerms) ?? { beca: false, cuota_especial: null },
    tipos: (tipos.data ?? []) as DocType[],
    docs: (docs.data ?? []) as MemberData["docs"],
    fee: (fee.data as Fee) ?? null,
    pagos: (pagos.data ?? []) as MemberData["pagos"],
    incidencias: (inc.data ?? []) as Incident[],
    medidas: (med.data ?? []) as Measure[],
    limite: (disc.data?.limite_advertencias as number) ?? 3,
    alta: (alta.data as Enrollment) ?? null,
  };
}

/** Enlaces temporales (10 min) a documentos privados; la base decide quién puede. */
export async function signDocs(paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("expedientes").createSignedUrls(list, 600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
