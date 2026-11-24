import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { PrintButton } from "@/components/PrintButton";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import type { Tablero } from "../CastBoard";
import { SECCIONES } from "../secciones";

export const metadata: Metadata = { title: "Documento del cast" };

const celda = "border-b border-white/10 px-2 py-1.5 text-left align-top print:border-black/20";
const th = `${celda} text-xs font-bold uppercase tracking-[0.1em] text-texto-3 print:text-black/60`;

// 0168: el cast como va (antes o después de mandar), por sección: protagonistas, apoyo, grupos de ensamble y ensamble
// general. Personaje y nombre. Se imprime o se guarda como PDF desde el navegador.
export default async function DocumentoCast({ params }: PageProps<"/panel/audiciones/[aid]/cast/documento">) {
  const { aid } = await params;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], "/cast/documento");
  const { data, error } = await (await createClient()).rpc("audition_cast_board", { aid });
  if (error) return <Card>{error.message}</Card>;
  const t = data as Tablero;
  const hoy = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const tabla = (titulo: string, filas: { personaje: string; nombre: string }[], col = "Personaje") => (
    <section key={titulo} className="flex flex-col gap-2 print:break-inside-avoid">
      <h2 className="titular border-b border-white/15 pb-1 text-lg print:border-black/30">{titulo}</h2>
      <table className="w-full border-collapse text-sm print:text-xs">
        <thead><tr><th className={`${th} w-2/5`}>{col}</th><th className={th}>Nombre</th></tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}><td className={`${celda} font-bold`}>{f.personaje}</td><td className={celda}>{f.nombre || <i className="text-texto-3">Sin asignar</i>}</td></tr>)}</tbody>
      </table>
    </section>
  );
  const persona = (p: { numero: number | null; nombre: string }) => `${p.numero ? `Nº ${p.numero} · ` : ""}${p.nombre}`;
  return (
    <div className="flex flex-col gap-6 print:gap-4 print:text-black">
      <Card className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/panel/audiciones/${aid}/cast`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Cast</Link>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/panel/audiciones/${aid}/exportar/cast`} className="text-sm font-bold text-violeta-claro">Excel <Icono nombre="flecha-abajo" /></a>
          <PrintButton label="Guardar como PDF" />
        </div>
      </Card>
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3 print:text-black/60">DARF Productions · {a.fase === "enviado" ? "Cast" : "Propuesta de cast (todavía no se manda)"}</p>
        <h1 className="titular text-3xl print:text-2xl">{t.obra ? `${t.obra} · ` : ""}{t.titulo ?? a.titulo}</h1>
        <p className="text-sm text-texto-2 print:text-black/70">Al {hoy}</p>
      </header>
      {SECCIONES.map(([cat, titulo]) => {
        const rs = t.roles.filter((r) => (r.categoria ?? "protagonista") === cat);
        if (!rs.length) return null;
        return tabla(titulo, rs.flatMap((r) => (r.asignados.length ? r.asignados.map((p) => ({ personaje: r.nombre, nombre: persona(p) })) : [{ personaje: r.nombre, nombre: "" }])), cat === "ensamble" ? "Grupo" : "Personaje");
      })}
      {t.ensamble.length > 0 && tabla("Ensamble general", t.ensamble.map((p) => ({ personaje: "Ensamble", nombre: persona(p) })))}
    </div>
  );
}
