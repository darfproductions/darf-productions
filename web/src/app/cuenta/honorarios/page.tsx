import type { Metadata } from "next";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { mayus } from "@/lib/dates";
import { diaDePago, lineaParte, type Parte } from "@/lib/honorarios-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis honorarios" };

const pesosRed = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const nombreMes = (periodo: string) => mayus(new Date(`${periodo.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }));

// Mis honorarios (0150): mi pago de cada mes cerrado con su desglose por bolsa y mi historial. La base solo me deja ver
// lo mío (hon_mes_personas, por mi ficha de persona).
export default async function MisHonorarios() {
  await requireSession("/cuenta/honorarios");
  const supabase = await createClient();
  const { data } = await supabase.from("hon_mes_personas").select("periodo, pago, bruto, partes, fondo_aplicado").order("periodo", { ascending: false });
  const meses = ((data ?? []) as { periodo: string; pago: number; bruto: number; partes: Parte[]; fondo_aplicado: boolean }[]);
  const anio = new Date().getFullYear();
  const delAnio = meses.filter((m) => m.periodo.startsWith(String(anio))).reduce((s, m) => s + Number(m.pago), 0);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 md:px-8">
      <PageHeading eyebrow="Mi cuenta" title="Mis honorarios">
        Lo que DARF te paga cada mes (de las mensualidades de los talleres) y de qué bolsa sale cada peso.
      </PageHeading>
      <Link href="/cuenta" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
      {meses.length === 0 ? (
        <p className="rounded-2xl bg-telon p-6 text-texto-2">Todavía no hay meses cerrados con un pago para ti.</p>
      ) : (
        <>
          <div className="rounded-2xl bg-telon p-6">
            <p className="text-sm text-texto-3">Cobrado en {anio}</p>
            <p className="text-3xl font-black">{pesosRed(delAnio)}</p>
          </div>
          <ul className="flex flex-col gap-4">
            {meses.map((m) => {
              const [a, mm] = m.periodo.split("-").map(Number);
              return (
                <li key={m.periodo} className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="titular text-xl">{nombreMes(m.periodo)}</h2>
                    <p className="text-2xl font-black">{pesosRed(m.pago)}</p>
                  </div>
                  <ul className="flex flex-col gap-1 text-sm text-texto-2">
                    {m.partes.map((p, i) => <li key={i}>{lineaParte(p, [])}</li>)}
                  </ul>
                  <p className="text-xs text-texto-3">
                    Suma {`$${Number(m.bruto).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}, redondeado hacia abajo a 10 pesos (lo que sobra va a la reserva de DARF).
                    {m.fondo_aplicado ? " Este mes se aplicó el fondo creativo común (aprobado por las cabezas de DARF)." : ""}
                    {" "}Día de pago: lunes {new Date(`${diaDePago(a, mm)}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" })}.
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
