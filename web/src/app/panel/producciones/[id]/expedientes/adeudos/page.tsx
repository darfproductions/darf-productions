import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { getAdeudos } from "@/lib/adeudos";
import { mesNombre, pesos } from "@/lib/member-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { ExpTabs } from "../ExpTabs";

export const metadata: Metadata = { title: "Adeudos" };

const pill = "rounded-full border px-3 py-1.5 text-xs font-bold";

// Quién debe en toda la obra, cuánto y de qué meses (0079). Con filtro, orden y exportar.
export default async function Adeudos({ params, searchParams }: PageProps<"/panel/producciones/[id]/expedientes/adeudos">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes/adeudos`);
  if (!can(access, id, "mensualidades.gestionar")) redirect(`/panel/producciones/${id}/expedientes`);
  const ver = sp.ver === "vencidos" ? "vencidos" : sp.ver === "todos" ? "todos" : "deben";
  const orden = sp.orden === "nombre" ? "nombre" : "monto";
  const { cobra, filas } = await getAdeudos(id);
  const deben = filas.filter((f) => f.adeudo.total > 0);
  const vencidos = deben.filter((f) => f.adeudo.meses.some((m) => m.vencido));
  const lista = (ver === "todos" ? filas : ver === "vencidos" ? vencidos : deben)
    .slice().sort((a, b) => orden === "nombre" ? a.nombre.localeCompare(b.nombre, "es") : b.adeudo.total - a.adeudo.total);
  const total = deben.reduce((s, f) => s + f.adeudo.total, 0);
  const liga = (k: string, v: string) => `?${new URLSearchParams({ ver, orden, [k]: v })}`;

  return (
    <div className="flex flex-col gap-4">
      <ExpTabs pid={id} actual="adeudos" pagos />
      {!cobra ? (
        <Card><p className="text-texto-2">Este taller no tiene pagos. Se configuran en Expedientes → Pagos del taller.</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center"><p className="text-2xl font-black">{pesos(total)}</p><p className="text-xs text-texto-3">Adeudo total a hoy</p></Card>
            <Card className="text-center"><p className="text-2xl font-black">{deben.length}</p><p className="text-xs text-texto-3">Personas que deben</p></Card>
            <Card className="text-center"><p className="text-2xl font-black text-[#fecdd3]">{vencidos.length}</p><p className="text-xs text-texto-3">Con pagos vencidos</p></Card>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-texto-3">Ver:</span>
              {([["deben", "Deben"], ["vencidos", "Vencidos"], ["todos", "Todos"]] as const).map(([k, l]) => (
                <Link key={k} href={liga("ver", k)} aria-current={ver === k ? "page" : undefined} className={`${pill} ${ver === k ? "border-texto bg-texto text-sala" : "border-white/25"}`}>{l}</Link>
              ))}
              <span className="ml-2 text-texto-3">Orden:</span>
              {([["monto", "Mayor adeudo"], ["nombre", "Nombre"]] as const).map(([k, l]) => (
                <Link key={k} href={liga("orden", k)} aria-current={orden === k ? "page" : undefined} className={`${pill} ${orden === k ? "border-texto bg-texto text-sala" : "border-white/25"}`}>{l}</Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/panel/producciones/${id}/expedientes/exportar/adeudos`} className={`${pill} border-white/25`}>Exportar adeudos (CSV) ↓</a>
              <a href={`/panel/producciones/${id}/expedientes/exportar/pagos`} className={`${pill} border-white/25`}>Exportar pagos (CSV) ↓</a>
            </div>
          </div>
          <Card className="overflow-x-auto p-0 md:p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
                <tr>{["Integrante", "Meses que debe", "Inscripción", "Total"].map((t) => <th key={t} className="px-4 py-3">{t}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {lista.map((f) => (
                  <tr key={f.user_id} className={f.baja ? "opacity-60" : ""}>
                    <td className="px-4 py-3">
                      <Link href={`/panel/producciones/${id}/expedientes/${f.user_id}`} className="font-bold hover:underline">{f.nombre}</Link>
                      {f.baja && <span className="ml-2 rounded-full bg-[#5a1a22] px-2 py-0.5 text-[10px] font-bold text-[#fecdd3]">Baja</span>}
                      {f.beca && <span className="ml-2 rounded-full bg-[#1e3a8a] px-2 py-0.5 text-[10px] font-bold text-[#dbeafe]">Beca</span>}
                    </td>
                    <td className="px-4 py-3">
                      {f.adeudo.meses.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {f.adeudo.meses.map((m) => (
                            <li key={m.periodo} className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${m.vencido ? "bg-[#5a1a22] text-[#fecdd3]" : "bg-[#3a3346] text-texto-2"}`}>
                              {mesNombre(m.periodo)} · {pesos(m.falta)}
                            </li>
                          ))}
                        </ul>
                      ) : <span className="text-texto-3">—</span>}
                    </td>
                    <td className="px-4 py-3">{f.adeudo.inscripcion ? pesos(f.adeudo.inscripcion) : "—"}</td>
                    <td className="px-4 py-3 font-bold">{f.adeudo.total ? pesos(f.adeudo.total) : <span className="font-normal text-[#bbf7d0]">Al corriente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="px-5 py-4 text-texto-2">{ver === "todos" ? "Aún no hay integrantes." : "Nadie debe. Todo al corriente."}</p>}
          </Card>
          <p className="text-xs text-texto-3">Cuenta los meses ya iniciados y la inscripción. Los pagos anulados no cuentan. Rojo = pasó el día límite. Cada integrante recibe un recordatorio 3 días antes del día límite y otro al día siguiente si sigue debiendo.</p>
        </>
      )}
    </div>
  );
}
