import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { ANCLA_SECCION, NOMBRE_SECCION, type EstadoCambio } from "@/lib/obra-capa-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { descartarCambios, publicarCambios } from "./actions";

const btn = "rounded-full px-3.5 py-1.5 text-xs font-bold disabled:opacity-60";
const fans = `${btn} border border-oro/50 text-oro-claro hover:border-oro`;
const todos = `${btn} bg-texto text-sala`;
const quitar = "text-xs font-bold text-texto-3 underline";
const cuando = (iso: string | null) => (iso ? formatPerformanceDate(iso).replace(/^\S+ /, "") : "");

// 0119: cambios de la página que aún no ve el público. Borrador → Club Fan → todos (o directo a todos).
export function CambiosPanel({ pid, cambios, publicar }: { pid: string; cambios: EstadoCambio[]; publicar: boolean }) {
  const borradores = cambios.filter((c) => c.borrador).length;
  return (
    <Card>
      <section id="cambios" className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Cambios sin publicar</h2>
          <p className="mt-1 text-sm text-texto-2">
            Con la obra publicada, lo que guardas abajo queda en <b>borrador</b> y el público no lo ve. Puedes publicarlo primero
            al <b className="text-oro-claro">Club Fan</b> (los socios lo ven en la misma página, con su cuenta) y después a <b>todos</b>; o directo a todos.
          </p>
        </div>
        {cambios.length === 0 ? (
          <p className="text-sm text-texto-3">No hay cambios pendientes: la página pública está al día.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-white/10 rounded-lg bg-sala">
              {cambios.map((c) => (
                <li key={c.seccion} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <b>{NOMBRE_SECCION[c.seccion]}</b>
                      {c.borrador && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase text-texto-2">Borrador</span>}
                      {c.fans && <span className="rounded-full border border-oro/50 px-2 py-0.5 text-[11px] font-bold uppercase text-oro-claro">Ya lo ven los fans</span>}
                    </span>
                    <span className="text-xs text-texto-3">
                      {c.borrador && `Guardado ${cuando(c.borrador_at)}`}{c.borrador && c.fans && " · "}{c.fans && `En fans desde ${cuando(c.fans_at)}`}
                      {" · "}<Link href={`#${ANCLA_SECCION[c.seccion]}`} className="underline">Editar</Link>
                    </span>
                  </span>
                  {publicar ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {c.borrador && <ActionForm inline action={publicarCambios} hidden={{ pid, seccion: c.seccion, destino: "fans" }} submit={<>Publicar a fans</>} submitClass={fans} />}
                      <ActionForm inline action={publicarCambios} hidden={{ pid, seccion: c.seccion, destino: "publico" }}
                        confirm={`¿Publicar «${NOMBRE_SECCION[c.seccion]}» para todos?`} submit="Publicar a todos" submitClass={todos} />
                      {c.borrador && <ActionForm inline action={descartarCambios} hidden={{ pid, seccion: c.seccion, capa: "borrador" }}
                        confirm="¿Tirar este borrador? Se pierde lo que no has publicado." submit="Descartar" submitClass={quitar} />}
                      {c.fans && !c.borrador && <ActionForm inline action={descartarCambios} hidden={{ pid, seccion: c.seccion, capa: "fans" }}
                        confirm="¿Quitarlo a los fans? Vuelven a ver lo publicado." submit="Quitar a fans" submitClass={quitar} />}
                    </span>
                  ) : (
                    c.borrador && <ActionForm inline action={descartarCambios} hidden={{ pid, seccion: c.seccion, capa: "borrador" }}
                      confirm="¿Tirar este borrador?" submit="Descartar" submitClass={quitar} />
                  )}
                </li>
              ))}
            </ul>
            {publicar ? (
              <div className="flex flex-wrap items-center gap-3">
                {borradores > 0 && <ActionForm inline action={publicarCambios} hidden={{ pid, destino: "fans" }}
                  confirm="¿Publicar todos los borradores para el Club Fan?" submit={<>Publicar todo a fans</>} submitClass={`${fans} px-5 py-2.5 text-sm`} />}
                <ActionForm inline action={publicarCambios} hidden={{ pid, destino: "publico" }}
                  confirm="¿Publicar todos los cambios para todos?" submit="Publicar todo a todos" submitClass={`${todos} px-5 py-2.5 text-sm`} />
                <Link href={`/vista-previa/${pid}`} target="_blank" className="text-sm font-bold text-violeta-claro">Ver cómo queda <Icono nombre="externo" /></Link>
              </div>
            ) : (
              <p className="text-sm text-texto-3">Publicar lo hace la Dirección de la obra o el Director.</p>
            )}
          </>
        )}
      </section>
    </Card>
  );
}
