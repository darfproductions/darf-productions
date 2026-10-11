import type { DocType, Fee, FeeTerms, MemberDoc, MemberFile, Payment } from "@/lib/member-rules";
import { createClient } from "@/lib/supabase/server";

// Lecturas del expediente (0041). Pasan por RLS: el integrante solo ve lo suyo; la
// producción, según expedientes.ver y mensualidades.gestionar.

export type MemberData = { file: MemberFile | null; terms: FeeTerms; tipos: DocType[]; docs: (MemberDoc & { id: string })[]; fee: Fee | null; pagos: (Payment & { id: string; metodo: string; nota: string | null; registrado_at: string })[] };

export async function getMemberData(pid: string, uid: string): Promise<MemberData> {
  const supabase = await createClient();
  const [file, tipos, docs, fee, pagos, terms] = await Promise.all([
    supabase.from("member_files").select("*").eq("production_id", pid).eq("user_id", uid).maybeSingle(),
    supabase.from("member_doc_types").select("id, nombre, solo_menores, obligatorio").eq("production_id", pid).order("orden").order("nombre"),
    supabase.from("member_docs").select("id, doc_type_id, archivo_path, subido_at, entregado_at").eq("production_id", pid).eq("user_id", uid),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite").eq("production_id", pid).maybeSingle(),
    supabase.from("member_payments").select("id, periodo, monto, metodo, nota, registrado_at").eq("production_id", pid).eq("user_id", uid).order("periodo"),
    supabase.from("member_fee_terms").select("beca, cuota_especial").eq("production_id", pid).eq("user_id", uid).maybeSingle(),
  ]);
  return {
    file: (file.data as MemberFile) ?? null,
    terms: (terms.data as FeeTerms) ?? { beca: false, cuota_especial: null },
    tipos: (tipos.data ?? []) as DocType[],
    docs: (docs.data ?? []) as MemberData["docs"],
    fee: (fee.data as Fee) ?? null,
    pagos: (pagos.data ?? []) as MemberData["pagos"],
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
