import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { PageHeading } from "@/components/PageHeading";
import { Icono } from "@/components/Icono";
import { requireSession } from "@/lib/auth";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { estadoLiga } from "@/lib/traspaso-rules";
import { aceptarTraspaso } from "../../actions";

export const metadata: Metadata = { title: "Boletos para ti", robots: { index: false, follow: false } };

type Info = {
  id: string; estado: string; created_at: string; mensaje: string | null; de: string; soy_quien_manda: boolean; para_mi: boolean; to_email: string | null;
  obra: string; production_id: string; starts_at: string | null; venue: string | null; vencida: boolean; boletos: string[]; new_order_code: string | null;
};

// La liga que recibe quien le pasaron boletos (0142): con su cuenta, ve de quién son y los acepta.
export default async function Traspaso({ params }: PageProps<"/cuenta/traspaso/[token]">) {
  const { token } = await params;
  await requireSession(`/cuenta/traspaso/${token}`);
  const supabase = await createClient();
  const { data } = /^[0-9a-f-]{36}$/.test(token) ? await supabase.rpc("ticket_transfer_info", { p_token: token }) : { data: null };
  const info = (data ?? null) as Info | null;
  const caja = "mx-auto flex max-w-[640px] flex-col gap-4 px-5 md:px-16";
  if (!info) {
    return (
      <main className="pb-10">
        <PageHeading eyebrow="Boletos" title="Esta liga no es válida" />
        <div className={caja}><p className="text-sm text-texto-2">Pídele a quien te pasó los boletos que te mande la liga otra vez desde su cuenta.</p><Link href="/cuenta" className="text-sm font-bold text-violeta-claro">Ir a Mi cuenta <Icono nombre="flecha-der" /></Link></div>
      </main>
    );
  }
  const e = estadoLiga(info);
  const n = info.boletos.length;
  const textos: Record<typeof e, string> = {
    aceptar: "", soy_yo: `Esta liga es para la persona a la que le pasaste los boletos${info.to_email ? ` (${info.to_email})` : ""}. Compártesela a ella.`,
    aceptada: info.new_order_code ? "Estos boletos ya se aceptaron." : "Estos boletos ya se aceptaron.",
    cancelada: `${info.de} canceló este traspaso. Los boletos siguen en su cuenta.`,
    vencida: "Este traspaso venció: la función ya empezó o la orden ya no está pagada.",
    otra_cuenta: "Estos boletos son para otra cuenta. Entra con el correo al que te los mandaron.",
  };
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Boletos para ti" title={`${info.de} te pasó ${n === 1 ? "1 boleto" : `${n} boletos`}`}>{info.obra}</PageHeading>
      <div className={caja}>
        <div className="flex flex-col gap-2 rounded-2xl bg-telon p-5 text-sm">
          <p className="text-lg font-bold">{info.obra}</p>
          <p className="text-texto-2"><Icono nombre="calendario" /> {formatPerformanceDate(info.starts_at)}{info.venue ? ` · ${info.venue}` : ""}</p>
          <p className="text-texto-2"><Icono nombre="boleto" /> {info.boletos.join(", ")}</p>
          {info.mensaje && <p className="mt-1 whitespace-pre-line">«{info.mensaje}»</p>}
        </div>
        {e === "aceptar" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-telon p-5">
            <p className="text-sm text-texto-2">Al aceptar, los boletos quedan en tu cuenta a tu nombre, con QR nuevos para la puerta. {info.de} deja de tenerlos.</p>
            <ActionForm action={aceptarTraspaso} hidden={{ token }} submit={n === 1 ? "Aceptar mi boleto" : "Aceptar mis boletos"} submitClass="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-60" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl bg-telon p-5">
            <p className="text-sm">{textos[e]}</p>
            <Link href={e === "aceptada" && info.new_order_code ? `/cuenta#o-${info.new_order_code}` : "/cuenta"} className="text-sm font-bold text-violeta-claro">Ir a Mi cuenta <Icono nombre="flecha-der" /></Link>
          </div>
        )}
      </div>
    </main>
  );
}
