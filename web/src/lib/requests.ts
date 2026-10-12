import type { MemberRequest } from "@/lib/request-rules";
import { createClient } from "@/lib/supabase/server";

// Lecturas de solicitudes (0070). Pasan por RLS: el integrante ve las suyas; la producción,
// las de los tipos que puede revisar (ensayos, expedientes o mensualidades).

const COLS = "id, production_id, user_id, tipo, estado, motivo, archivo_path, doc_type_id, doc_nombre, concepto, periodo, monto, metodo, monto_aprobado, respuesta, revisado_at, created_at, member_request_rehearsals(rehearsals(id, titulo, inicia))";

type Row = Omit<MemberRequest, "ensayos"> & { member_request_rehearsals: { rehearsals: { id: string; titulo: string; inicia: string } | null }[] };

const limpiar = (rows: Row[]): MemberRequest[] =>
  rows.map(({ member_request_rehearsals: mrr, ...r }) => ({
    ...r,
    monto: r.monto === null ? null : Number(r.monto),
    monto_aprobado: r.monto_aprobado === null ? null : Number(r.monto_aprobado),
    ensayos: (mrr ?? []).flatMap((x) => (x.rehearsals ? [x.rehearsals] : [])).sort((a, b) => a.inicia.localeCompare(b.inicia)),
  }));

export async function listRequests(pid: string, opts: { uid?: string; limit?: number } = {}): Promise<MemberRequest[]> {
  const supabase = await createClient();
  let q = supabase.from("member_requests").select(COLS).eq("production_id", pid).order("created_at", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.uid) q = q.eq("user_id", opts.uid);
  const { data } = await q;
  return limpiar((data ?? []) as unknown as Row[]);
}

/** Horas de anticipación para pedir una falta en la obra (24 por omisión). */
export async function avisoFaltaHoras(pid: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("production_discipline").select("aviso_falta_horas").eq("production_id", pid).maybeSingle();
  return (data?.aviso_falta_horas as number | undefined) ?? 24;
}
