import Link from "next/link";
import { AgregarCalendario } from "@/components/AgregarCalendario";
import { Icono } from "@/components/Icono";
import { ASISTENCIA, fechaEnsayo } from "@/lib/rehearsal-rules";

// Mis ensayos como equipo de producción o encargado (0099), en Mi cuenta. Hoy, con el botón para abrir
// el ensayo o pasar lista; los próximos, con su calendario.

export type MiEnsayoEquipo = {
  id: string; production_id: string; obra: string; titulo: string; inicia: string; termina: string | null; lugar: string | null; estado: string;
  encargado: boolean; abierto_at: string | null; cerrado_at: string | null; puede_abrir: boolean; puede_pasar_lista: boolean; mi_estado: string | null;
};

export function MisEnsayosEquipo({ ensayos }: { ensayos: MiEnsayoEquipo[] }) {
  if (!ensayos.length) return null;
  const boton = "inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala";
  return (
    <section aria-labelledby="mis-ensayos-equipo" className="flex flex-col gap-3 order-3 lg:order-none">
      <h2 id="mis-ensayos-equipo" className="titular text-2xl">Ensayos del equipo</h2>
      <ul className="flex flex-col gap-3">
        {ensayos.map((e) => (
          <li key={e.id} className={`flex flex-col gap-2 rounded-2xl bg-telon p-5 ${e.estado === "cancelado" ? "opacity-60" : ""}`}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-texto-3">{e.obra}{e.encargado ? " · Eres encargado" : ""}</p>
            <p className="text-lg font-bold">{e.titulo}{e.estado === "cancelado" && <span className="ml-2 text-sm text-[#fecdd3]">Cancelado</span>}</p>
            <p className="text-sm text-texto-2">{fechaEnsayo(e.inicia, e.termina)}{e.lugar ? ` · ${e.lugar}` : ""}</p>
            {e.mi_estado && <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${ASISTENCIA[e.mi_estado]?.cls ?? ""}`}>{ASISTENCIA[e.mi_estado]?.label}</span>}
            {e.estado !== "cancelado" && (
              e.puede_pasar_lista ? <Link href={`/cuenta/ensayo/${e.id}`} className={boton}><Icono nombre="lista" /> Pasar lista</Link>
              : e.puede_abrir ? <Link href={`/cuenta/ensayo/${e.id}`} className={boton}><Icono nombre="candado" /> Abrir ensayo y pasar lista</Link>
              : e.encargado && e.abierto_at && !e.cerrado_at ? <Link href={`/cuenta/ensayo/${e.id}`} className="text-sm font-bold text-violeta-claro">Ya está abierto: pide que escaneen tu QR <Icono nombre="flecha-der" /></Link>
              : <AgregarCalendario ics={`/calendario/ensayo/${e.id}`} evento={{ uid: `ensayo-${e.id}`, titulo: `Ensayo: ${e.titulo}`, inicia: e.inicia, termina: e.termina, lugar: e.lugar }} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
