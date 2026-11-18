import type { Metadata } from "next";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { PrintButton } from "@/components/PrintButton";
import { Card } from "@/components/panel/ui";
import { ESTADO_SOLICITUD } from "@/lib/audition-rules";
import { ORDENES, armarLista, ordenValido, primeraDelTurno, type Orden } from "@/lib/lista-audicion-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { cargarLista } from "./datos";

export const metadata: Metadata = { title: "Lista para imprimir" };

// Que no se repita la lista en revisión: "aprobadas" deja fuera a quien sigue en revisión o en espera.
const PENDIENTES = ["inscrito", "en_espera"];

// Lista de la convocatoria para imprimir o guardar en PDF: turno, quién, de qué audiciona, de qué grupo es y con quién
// pasa. Con una columna para palomear la llegada y otra para notas. Solo quien gestiona (igual que el Excel).
export default async function ListaImprimir({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/lista">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], "/lista");
  const orden = ordenValido(sp.orden);
  const soloAprobadas = sp.solo === "aprobadas";
  const todas = await cargarLista(aid);
  const apps = soloAprobadas ? todas.filter((x) => !PENDIENTES.includes(x.estado)) : todas;
  const secciones = armarLista(apps, orden);
  const hayGrupo = apps.some((x) => x.grupo);
  const hayHorario = apps.some((x) => x.horario);
  const conGrupo = hayGrupo && orden !== "grupo";
  const liga = (o: Orden, solo: boolean) => `/panel/audiciones/${aid}/lista?orden=${o}${solo ? "&solo=aprobadas" : ""}`;
  const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date());
  const celda = "border-b border-white/10 px-2 py-2 align-top print:border-black/25";

  return (
    <div className="flex flex-col gap-5 print:gap-3 print:text-black">
      <style>{"@page { size: landscape; margin: 12mm; }"}</style>
      <Card className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/panel/audiciones/${aid}/solicitudes`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Solicitudes</Link>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/panel/audiciones/${aid}/exportar?orden=${orden}${soloAprobadas ? "&solo=aprobadas" : ""}`} className="text-sm font-bold text-violeta-claro">Descargar en Excel ({ORDENES[orden].toLowerCase()}) <Icono nombre="flecha-abajo" /></a>
            <PrintButton />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-3">Ordenar:</span>
          {(Object.keys(ORDENES) as Orden[]).map((o) => (
            <Link key={o} href={liga(o, soloAprobadas)} className={`rounded-full border px-3 py-1.5 font-semibold ${o === orden ? "border-texto bg-texto text-sala" : "border-linea-2"}`}>{ORDENES[o]}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-3">Incluir:</span>
          <Link href={liga(orden, false)} className={`rounded-full border px-3 py-1.5 font-semibold ${!soloAprobadas ? "border-texto bg-texto text-sala" : "border-linea-2"}`}>Todas</Link>
          <Link href={liga(orden, true)} className={`rounded-full border px-3 py-1.5 font-semibold ${soloAprobadas ? "border-texto bg-texto text-sala" : "border-linea-2"}`}>Solo aprobadas</Link>
        </div>
        <p className="text-xs text-texto-3">Sale en horizontal para que quepan las columnas. Las canceladas y las que no cumplen no aparecen. Quienes pasan juntos comparten el número de turno.</p>
      </Card>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3 print:text-black/60">Audiciones · {ORDENES[orden]}{soloAprobadas ? " · solo aprobadas" : ""}</p>
          <h1 className="titular text-2xl print:text-xl">{a.titulo}</h1>
        </div>
        <p className="text-sm text-texto-2 print:text-black/70">{apps.length} {apps.length === 1 ? "persona" : "personas"} · {fecha}</p>
      </header>

      {!apps.length && <Card className="text-texto-2">Todavía no hay solicitudes para esta lista.</Card>}
      {secciones.map((s, si) => (
        <section key={s.titulo ?? si} className="flex flex-col gap-2 break-inside-avoid-page">
          {s.titulo && <h2 className="text-lg font-bold">{s.titulo} <span className="text-sm font-normal text-texto-3 print:text-black/60">· {s.filas.length}</span></h2>}
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[760px] border-collapse text-sm print:min-w-0 print:text-[11px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3 print:text-black/70">
                  <th className={`${celda} w-14`}>Turno</th>
                  <th className={celda}>Nombre</th>
                  <th className={`${celda} w-12`}>Edad</th>
                  <th className={celda}>Audiciona para</th>
                  {conGrupo && <th className={celda}>Grupo</th>}
                  <th className={celda}>Pasa con</th>
                  {hayHorario && <th className={celda}>Horario</th>}
                  <th className={`${celda} w-12 text-center`}>Llegó</th>
                  <th className={`${celda} w-40`}>Notas</th>
                </tr>
              </thead>
              <tbody>
                {s.filas.map((f, i) => (
                  <tr key={`${f.id}-${i}`} className="break-inside-avoid">
                    <td className={`${celda} text-lg font-black`}>{f.numero != null && primeraDelTurno(s.filas, i) ? f.numero : ""}</td>
                    <td className={celda}>
                      <span className="font-semibold">{f.nombre}</span>
                      {PENDIENTES.includes(f.estado) && <span className="block text-xs text-texto-3 print:text-black/60">{ESTADO_SOLICITUD[f.estado]?.label}</span>}
                    </td>
                    <td className={celda}>{f.edad ?? ""}</td>
                    <td className={celda}>{f.personajes.join(", ") || "—"}</td>
                    {conGrupo && <td className={celda}>{f.grupo ?? "—"}</td>}
                    <td className={celda}>{f.pasaCon}</td>
                    {hayHorario && <td className={celda}>{f.horario ?? "—"}</td>}
                    <td className={`${celda} text-center`}><span aria-hidden="true" className="inline-block h-4 w-4 rounded border border-white/40 print:border-black/60" /></td>
                    <td className={celda} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
