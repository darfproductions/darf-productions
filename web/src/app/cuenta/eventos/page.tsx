import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ArtFill } from "@/components/PosterArt";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { whatsappEventoUrl } from "@/lib/eventos-rules";
import { limiteTexto } from "@/lib/expiry-rules";
import { getMisEventos, type MiEvento } from "@/lib/fanzone";
import { getEventosAsistidos, getTheme } from "@/lib/historial";
import { formatPerformanceDate } from "@/lib/productions";
import { AgregarCalendario } from "@/components/AgregarCalendario";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Mis eventos" };

const pesos = (n: number | null) => `$${Number(n ?? 0).toLocaleString("es-MX")}`;
function estado(e: MiEvento): { texto: string; clase: string; ok?: boolean } {
  if (e.cancelado) return { texto: e.orden_status === "aprobado" ? "Evento cancelado · te contactaremos para tu reembolso" : "Evento cancelado", clase: "text-[#ff8fa3]" };
  if (e.llegada_at) return { texto: "Asististe", clase: "text-exito", ok: true };
  if (e.orden_status === "pendiente") return { texto: `Por pagar ${pesos(e.orden_monto)}`, clase: "text-aviso" };
  if (e.orden_status === "aprobado") return { texto: Number(e.orden_monto) > 0 ? `Pagado ${pesos(e.orden_monto)}` : "Confirmado", clase: "text-exito", ok: true };
  if (e.orden_status === "rechazado") return { texto: e.vencida ? "Venció sin pago" : "Cancelado", clase: "text-texto-3" };
  return { texto: "Lugar apartado", clase: "text-exito", ok: true };
}

// Mis eventos: los eventos de DARF que aparté o pagué (0083) y las funciones a las que entré
// con mis boletos (bloque 5).
export default async function Eventos() {
  const session = await requireSession("/cuenta/eventos");
  const [eventos, mios] = await Promise.all([getEventosAsistidos(session.userId), getMisEventos()]);
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Mi cuenta" title="Mis eventos">
        Los eventos que apartaste (y su pago) y las funciones a las que ya fuiste.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-lila"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
        <section aria-labelledby="mios-t" className="flex flex-col gap-4">
          <h2 id="mios-t" className="text-xl font-black">Eventos DARF</h2>
          {mios.length === 0 ? (
            <p className="tarjeta p-6 text-texto-2">Aún no apartas lugar en ningún evento. <Link href="/eventos" className="font-bold text-lila">Ver eventos <Icono nombre="flecha-der" /></Link></p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {mios.map((e) => {
                const st = estado(e);
                const pagar = e.orden_status === "pendiente" && e.orden_codigo && env.whatsapp
                  ? whatsappEventoUrl(env.whatsapp, { titulo: e.titulo, obra: e.obra, codigo: e.orden_codigo, monto: Number(e.orden_monto ?? 0) }) : "";
                return (
                  <li key={e.id} className="tarjeta flex flex-col gap-2 p-5">
                    <span className={`text-sm font-bold ${st.clase}`}>{st.ok && <><Icono nombre="check" /> </>}{st.texto}</span>
                    <strong className="text-lg">{e.titulo}</strong>
                    <span className="text-[12.5px] text-texto-3">{formatPerformanceDate(e.starts_at)}{e.lugar ? ` · ${e.lugar}` : ""}{e.obra ? ` · ${e.obra}` : ""}</span>
                    {e.orden_codigo && <span className="font-mono text-xs text-texto-2">{e.orden_codigo}</span>}
                    {!e.cancelado && e.starts_at && <AgregarCalendario ics={`/calendario/evento/${e.id}`} evento={{ uid: `evento-${e.id}`, titulo: e.titulo, inicia: e.starts_at, lugar: e.lugar }} />}
                    {e.cancelado && e.cancelado_motivo && <p className="text-sm text-texto-2">Motivo: {e.cancelado_motivo}</p>}
                    {!e.cancelado && e.orden_status === "pendiente" && e.orden_expira && <p className="text-sm text-aviso">Paga antes de <b>{limiteTexto(e.orden_expira)}</b>; si no, tu lugar se libera solo.</p>}
                    <div className="flex flex-wrap gap-2">
                      {pagar && !e.cancelado && <a href={pagar} target="_blank" rel="noopener noreferrer" className="fb fb-fz fb-sm">Pagar por WhatsApp <Icono nombre="externo" /></a>}
                      {!e.cancelado && <Link href={`/eventos#e-${e.id}`} className="fb fb-o fb-sm">Ver evento</Link>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <h2 className="text-xl font-black">Funciones a las que fuiste</h2>
        {eventos.length === 0 ? (
          <p className="tarjeta p-6 text-texto-2">Aquí aparecerán las funciones a las que vayas. <Link href="/producciones?estado=cartelera" className="font-bold text-lila">Ver producciones <Icono nombre="flecha-der" /></Link></p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((e) => {
              const t = getTheme(e.obra);
              return (
                <li key={e.performanceId}>
                  <Link href={`/producciones/${e.obra.id}`} className="tarjeta tarjeta-hover block">
                    <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo ?? "var(--telon-2)" }}>
                      {t ? <ArtFill theme={t} alt={e.obra.nombre} sizes="(min-width: 1024px) 30vw, 100vw" /> : <span className="titular absolute inset-x-5 bottom-5 text-2xl">{e.obra.nombre}</span>}
                      <span className="chip chip-oro absolute left-4 top-4 bg-sala/70 backdrop-blur"><Icono nombre="check" /> Asististe</span>
                    </div>
                    <div className="flex flex-col gap-1 px-5 py-4">
                      <strong className="text-lg">{e.obra.nombre}</strong>
                      <span className="text-[12.5px] text-texto-3">{formatPerformanceDate(e.funcion)} · {e.boletos} {e.boletos === 1 ? "boleto" : "boletos"}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
