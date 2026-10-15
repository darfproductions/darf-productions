import type { Enrollment, Fee, FeeTerms } from "@/lib/member-rules";
import { adeudoDetalle, type Adeudo } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";

// Adeudos y pagos de toda la obra (0079), para la pestaña Adeudos y para exportar.
// Pasan por RLS: solo quien tiene mensualidades.gestionar ve los pagos de los demás.

type Roster = { user_id: string; nombre: string; email: string };
/** `user_id` es "ficha:<id>" para quien aún no tiene cuenta (0111); `href` lleva a su expediente o a su ficha. */
export type FilaAdeudo = { user_id: string; nombre: string; email: string; beca: boolean; baja: boolean; sinCuenta: boolean; href: string; adeudo: Adeudo };

/** Pagos y altas por ficha (0111) de quien aún no tiene cuenta: pasan a su cuenta cuando la liga. */
export type PagoFicha = { person_id: string; concepto: "mensualidad" | "inscripcion"; periodo: string; monto: number; pagado_at: string };
type CuotaFicha = { person_id: string; ingreso: string | null; baja_at: string | null; beca: boolean; sin_inscripcion: boolean; people: { nombre: string; profile_id: string | null } | null };
export async function getPagosFicha(pid: string): Promise<{ pagos: PagoFicha[]; cuotas: CuotaFicha[] }> {
  const supabase = await createClient();
  const [pagos, cuotas] = await Promise.all([
    supabase.from("member_payments_ficha").select("person_id, concepto, periodo, monto, pagado_at").eq("production_id", pid).order("pagado_at"),
    supabase.from("ficha_cuotas").select("person_id, ingreso, baja_at, beca, sin_inscripcion, people(nombre, profile_id)").eq("production_id", pid),
  ]);
  return { pagos: (pagos.data ?? []) as PagoFicha[], cuotas: (cuotas.data ?? []) as unknown as CuotaFicha[] };
}
export type PagoObra = {
  id: string; user_id: string; nombre: string; folio: string; concepto: "mensualidad" | "inscripcion"; periodo: string;
  monto: number; metodo: string; nota: string | null; registrado_at: string; anulado_at: string | null; motivo_anulacion: string | null;
};

async function base(pid: string) {
  const supabase = await createClient();
  const [roster, fee, pagos, terms, altas] = await Promise.all([
    supabase.rpc("cast_roster", { pid }),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite, cobrar, inscripcion, vence_sabado").eq("production_id", pid).maybeSingle(),
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
  const [b, ficha] = await Promise.all([base(pid), getPagosFicha(pid)]);
  if (!b.fee || b.fee.cobrar === false) return { cobra: false, filas: [] };
  const filas: FilaAdeudo[] = b.gente.map((g) => {
    const t = b.terms.find((x) => x.user_id === g.user_id) ?? { beca: false, cuota_especial: null };
    const alta = b.altas.find((x) => x.user_id === g.user_id) ?? null;
    return {
      user_id: g.user_id, nombre: g.nombre, email: g.email, beca: t.beca, baja: !!alta?.baja_at, sinCuenta: false,
      href: `/panel/producciones/${pid}/expedientes/${g.user_id}`,
      adeudo: adeudoDetalle(b.fee!, t, b.pagos.filter((p) => p.user_id === g.user_id), hoy, alta),
    };
  });
  // Quien aún no tiene cuenta (0111): sus pagos y su alta están en su ficha.
  for (const c of ficha.cuotas) {
    if (!c.people || c.people.profile_id) continue;
    const t: FeeTerms = { beca: c.beca, cuota_especial: null, sin_inscripcion: c.sin_inscripcion };
    const alta: Enrollment = { ingreso: c.ingreso ?? b.fee.desde, baja_at: c.baja_at };
    filas.push({
      user_id: `ficha:${c.person_id}`, nombre: c.people.nombre, email: "", beca: c.beca, baja: !!c.baja_at, sinCuenta: true,
      href: `/panel/talento/p/${c.person_id}`,
      adeudo: adeudoDetalle(b.fee, t, ficha.pagos.filter((p) => p.person_id === c.person_id), hoy, alta),
    });
  }
  return { cobra: true, filas };
}

export async function getPagosObra(pid: string): Promise<PagoObra[]> {
  const b = await base(pid);
  const nombre = new Map(b.gente.map((g) => [g.user_id, g.nombre]));
  return b.pagos.map((p) => ({ ...p, nombre: nombre.get(p.user_id) ?? "—" }));
}
