import Link from "next/link";
import { BotonRecordatorio } from "@/components/fanzone/BotonRecordatorio";
import { partesFuncion } from "@/lib/disponibilidad";
import { getPreventas } from "@/lib/preventa";
import { Icono } from "@/components/Icono";

// Tarjetas de preventa del Club Fan en la Fan Zone (imagen de referencia): abierta → "Entrar a
// preventa"; obra próxima → "Activar recordatorio".
export async function PreventaFanZone({ pid }: { pid: string | null }) {
  const lista = await getPreventas(pid);
  if (!lista.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {lista.map((x) => {
        const h = x.hasta ? partesFuncion(x.hasta) : null;
        return (
          <li key={x.pid} className="flex flex-col gap-4 rounded-[22px] border border-oro/35 bg-[linear-gradient(100deg,rgb(215_187_95/0.12),#120f17_55%)] p-5 md:flex-row md:items-center md:justify-between md:px-7">
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-xl text-sala" style={{ background: "var(--oro-metal)" }}><Icono nombre="boleto" /></span>
              <div className="flex flex-col gap-1">
                <strong className="text-[17px]">{x.estado === "abierta" ? `Preventa de ${x.nombre} abierta para el Club Fan` : `Preventa de ${x.nombre} para el Club Fan`}</strong>
                <span className="text-[12.5px] text-texto-3">
                  {x.estado === "abierta" && h
                    ? `Compras antes que nadie, hasta el ${h.dia} ${h.numero} ${h.mes}, ${h.hora}. Después se abre para todos.`
                    : "Tienes acceso antes de la venta general. Te avisamos en tu cuenta y en tu teléfono el día que abra."}
                </span>
              </div>
            </div>
            {x.estado === "abierta" ? (
              <Link href={`/producciones/${x.pid}#funciones`} className="fb fb-fz fb-sm self-start md:self-auto">Entrar a preventa</Link>
            ) : (
              <BotonRecordatorio pid={x.pid} activo={x.recordatorio} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
