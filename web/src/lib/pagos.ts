import { adeudo, estadoCuotas, estadoInscripcion, venceCorto } from "@/lib/member-rules";
import { getMemberData } from "@/lib/members";
import type { Recibo } from "@/lib/pago-rules";
import type { EstadoCuenta } from "@/lib/pdf-recibo";
import { createClient } from "@/lib/supabase/server";

// Recibos y estado de cuenta (0079). payment_receipt decide quién puede: la persona o quien
// maneja pagos en la obra.

export async function getRecibo(id: string): Promise<Recibo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("payment_receipt", { p_id: id });
  return (data as Recibo | null) ?? null;
}

export async function getEstadoCuenta(pid: string, uid: string, nombre: string): Promise<EstadoCuenta | null> {
  const d = await getMemberData(pid, uid);
  if (!d.fee) return null;
  const supabase = await createClient();
  const { data: obra } = await supabase.from("productions").select("nombre").eq("id", pid).maybeSingle();
  const meses = estadoCuotas(d.fee, d.terms, d.pagos, new Date(), d.alta);
  const inscripcion = estadoInscripcion(d.fee, d.terms, d.pagos);
  return {
    obra: (obra?.nombre as string) ?? pid, nombre,
    mensualidad: Number(d.terms.cuota_especial ?? d.fee.monto), beca: d.terms.beca, vence: venceCorto(d.fee),
    meses, inscripcion, adeudo: adeudo(meses) + Math.max(0, inscripcion.debe - inscripcion.pagado),
    pagos: [...d.pagos].sort((a, b) => a.registrado_at.localeCompare(b.registrado_at)),
  };
}

export function pdfResponse(bytes: Uint8Array, nombre: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "private, no-store" },
  });
}
