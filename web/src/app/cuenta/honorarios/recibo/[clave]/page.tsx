import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icono } from "@/components/Icono";
import { PrintButton } from "@/components/PrintButton";
import { requireSession } from "@/lib/auth";
import { mayus } from "@/lib/dates";
import { lineaParte, type Parte } from "@/lib/honorarios-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recibo de honorarios" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nombreMes = (p: string) => mayus(new Date(`${p.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }));

type Fila = { person_id: string; nombre: string; titulo?: string | null; pago: number; bruto: number; partes: Parte[]; pagado_at: string | null; folio: string | null };

// Recibo de honorarios (0152): comprobante interno con folio, para imprimir o guardar en PDF. clave: "m-AAAA-MM" (un mes)
// o "c-<cierre>" (un cierre de temporada). La persona ve el suyo; las cabezas, el de cualquiera (?p=<persona>).
export default async function Recibo({ params, searchParams }: PageProps<"/cuenta/honorarios/recibo/[clave]">) {
  const { clave } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/cuenta/honorarios/recibo/${clave}`);
  const persona = typeof sp.p === "string" && /^[0-9a-f-]{36}$/.test(sp.p) ? sp.p : null;
  const supabase = await createClient();
  // Sin ?p=, el recibo es el mío (aunque sea cabeza y pueda ver los de todos).
  const { data: mias } = persona ? { data: null } : await supabase.from("people").select("id").eq("profile_id", session.userId);
  const yo = ((mias ?? []) as { id: string }[]).map((x) => x.id);
  let fila: Fila | null = null;
  let concepto = "";
  const mes = /^m-(\d{4}-\d{2})$/.exec(clave)?.[1];
  const cierre = /^c-([0-9a-f-]{36})$/.exec(clave)?.[1];
  if (mes) {
    let q = supabase.from("hon_mes_personas").select("person_id, nombre, pago, bruto, partes, pagado_at, folio").eq("periodo", `${mes}-01`);
    if (persona) q = q.eq("person_id", persona);
    else if (yo.length) q = q.in("person_id", yo);
    fila = ((await q.limit(1).maybeSingle()).data as Fila | null) ?? null;
    concepto = `Honorarios de ${nombreMes(mes).toLowerCase()} (mensualidades de los talleres)`;
  } else if (cierre) {
    let q = supabase.from("hon_cierre_personas").select("person_id, nombre, titulo, pago, bruto, partes, pagado_at, folio").eq("cierre_id", cierre);
    if (persona) q = q.eq("person_id", persona);
    else if (yo.length) q = q.in("person_id", yo);
    fila = ((await q.limit(1).maybeSingle()).data as Fila | null) ?? null;
    concepto = `Honorarios del cierre de temporada${fila?.titulo ? `: ${fila.titulo}` : ""}`;
  }
  if (!fila) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-16 pt-6 md:px-8 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/cuenta/honorarios" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mis honorarios</Link>
        {fila.folio && <PrintButton />}
      </div>
      {!fila.folio ? (
        <p className="rounded-2xl bg-telon p-6 text-texto-2">Este pago todavía no se marca como pagado: el recibo aparece cuando DARF lo pague.</p>
      ) : (
        <article className="rounded-2xl bg-white p-8 text-black shadow-xl print:rounded-none print:shadow-none">
          <div className="flex flex-wrap justify-between gap-3">
            <div><p className="text-xl font-black">DARF Productions</p><p className="text-xs text-black/60">Comprobante de pago de honorarios</p></div>
            <div className="text-right text-sm"><p className="font-bold">Folio {fila.folio}</p><p>{new Date(fila.pagado_at!).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" })}</p></div>
          </div>
          <hr className="my-5 border-black/10" />
          <p className="text-sm"><b>Para:</b> {fila.nombre}</p>
          <p className="mb-4 text-sm"><b>Concepto:</b> {concepto}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-black/60"><th className="py-1">De dónde sale</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {fila.partes.map((p, i) => <tr key={i} className="border-t border-black/10"><td className="py-1.5">{lineaParte(p, [])}</td><td className="text-right">{pesos(p.monto)}</td></tr>)}
              <tr className="border-t border-black/10 text-black/60"><td className="py-1.5">Redondeo hacia abajo (lo que sobra va a la reserva de DARF)</td><td className="text-right">− {pesos(Number(fila.bruto) - Number(fila.pago))}</td></tr>
              <tr className="border-t-2 border-black"><td className="py-2 font-black">Total pagado</td><td className="text-right font-black">{pesos(Number(fila.pago))}</td></tr>
            </tbody>
          </table>
          <p className="mt-6 text-[11px] text-black/50">Este documento es un comprobante interno de DARF Productions y no es una factura fiscal.</p>
        </article>
      )}
    </main>
  );
}
