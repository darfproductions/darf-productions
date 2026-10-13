import type { Enrollment, Fee, FeeTerms } from "@/lib/member-rules";
import { adeudoDetalle, type Adeudo } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";

// Adeudos y pagos de toda la obra (0079), para la pestaña Adeudos y para exportar.
// Pasan por RLS: solo quien tiene mensualidades.gestionar ve los pagos de los demás.

type Roster = { user_id: string; nombre: string; email: string };
export type FilaAdeudo = { user_id: string; nombre: string; email: string; beca: boolean; baja: boolean; adeudo: Adeudo };
export type PagoObra = {
  id: string; user_id: string; nombre: string; folio: string; concepto: "mensualidad" | "inscripcion"; periodo: string;
  monto: number; metodo: string; nota: string | null; registrado_at: string; anulado_at: string | null; motivo_anulacion: string | null;
};

async function base(pid: string) {
  const supabase = await createClient();
  const [roster, fee, pagos, terms, altas] = await Promise.all([
    supabase.rpc("cast_roster", { pid }),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite, cobrar, inscripcion").eq("production_id", pid).maybeSingle(),
    todasLasFilas((a, b) => supabase.from("member_payments").select("id, user_id, folio, concepto, periodo, monto, metodo, nota, registrado_at, anulado_at, motivo_anulacion").eq("production_id", pid).order("registrado_at").order("id").range(a, b)),
    supabase.from("member_fee_terms").select("user_id, beca, cuota_especial, sin_inscripcion").eq("production_id", pid),
    supabase.from("member_enrollment").select("user_id, ingreso, baja_at, baja_motivo").eq("production_id", pid),
  ]);
  return {
    gente: (roster.data ?? []) as Roster[],
    fee: fee.data as Fee | null,
    pagos: (pagos.data ?? []) as Omit<PagoObra, "nombre">[],
    terms: (terms.data ?? []) as (FeeTerms & { user_id: string })[],
    altas: (altas.data ?? []) as (Enrollment & { user_id: string })[],
  };
}

export async function getAdeudos(pid: string, hoy: Date = new Date()): Promise<{ cobra: boolean; filas: FilaAdeudo[] }> {
  const b = await base(pid);
  if (!b.fee || b.fee.cobrar === false) return { cobra: false, filas: [] };
  const filas = b.gente.map((g) => {
    const t = b.terms.find((x) => x.user_id === g.user_id) ?? { beca: false, cuota_especial: null };
    const alta = b.altas.find((x) => x.user_id === g.user_id) ?? null;
    return {
      user_id: g.user_id, nombre: g.nombre, email: g.email, beca: t.beca, baja: !!alta?.baja_at,
      adeudo: adeudoDetalle(b.fee!, t, b.pagos.filter((p) => p.user_id === g.user_id), hoy, alta),
    };
  });
  return { cobra: true, filas };
}

export async function getPagosObra(pid: string): Promise<PagoObra[]> {
  const b = await base(pid);
  const nombre = new Map(b.gente.map((g) => [g.user_id, g.nombre]));
  return b.pagos.map((p) => ({ ...p, nombre: nombre.get(p.user_id) ?? "—" }));
}
