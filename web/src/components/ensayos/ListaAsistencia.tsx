import { CheckinGafete } from "@/app/panel/producciones/[id]/ensayos/[rid]/CheckinGafete";
import { Mark } from "@/app/panel/producciones/[id]/ensayos/[rid]/Mark";
import { cerrarLista, reabrirLista } from "@/app/panel/producciones/[id]/ensayos/actions";
import { Icono } from "@/components/Icono";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { horaMx } from "@/lib/acceso-rules";
import { ASISTENCIA, type Rehearsal } from "@/lib/rehearsal-rules";

// Lista de asistencia de un ensayo (0099): la usan el panel y el encargado desde Mi cuenta. Varias personas
// pueden pasar lista a la vez (cada quien a su grupo); todo queda en la misma lista y se ve quién marcó.

export type FilaLista = {
  user_id: string; nombre: string; papeles: string[]; estado: string | null; minutos_tarde: number | null; nota: string | null;
  aviso: string | null; equipo: boolean; encargado: boolean; marcado_por: string | null; llegada_at: string | null;
};

function Fila({ x, pid, rid, puede }: { x: FilaLista; pid: string; rid: string; puede: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="min-w-0">
        <b>{x.nombre}</b> <span className="text-xs text-texto-3">{x.papeles.join(", ")}</span>
        {x.encargado && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">Encargado</span>}
        {x.estado === "retardo" && x.minutos_tarde && <span className="ml-2 text-xs text-aviso">{x.minutos_tarde} min</span>}
        {x.nota === "Gafete" && <span className="ml-2 text-xs text-texto-3"><Icono nombre="credencial" /> QR</span>}
        {x.aviso && <span className="block text-xs text-[#a48bff]">{x.aviso}</span>}
        {x.estado && x.marcado_por && (
          <span className="block text-xs text-texto-3">Marcó {x.marcado_por}{x.llegada_at ? ` · llegó ${horaMx(x.llegada_at)}` : ""}</span>
        )}
      </span>
      {puede ? <Mark pid={pid} rid={rid} uid={x.user_id} actual={x.estado} />
        : x.estado && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${ASISTENCIA[x.estado]?.cls ?? ""}`}>{ASISTENCIA[x.estado]?.label ?? x.estado}</span>}
    </li>
  );
}

export function ListaAsistencia({ pid, rid, ensayo, filas, puede, lider }: {
  pid: string; rid: string; ensayo: Rehearsal; filas: FilaLista[];
  /** Puede marcar (dirección, maestros, producción o encargado activo). */
  puede: boolean;
  /** Dirección, maestros o producción: reabren una lista cerrada. */
  lider: boolean;
}) {
  const cuenta = (k: string) => filas.filter((x) => x.estado === k).length;
  const elenco = filas.filter((x) => !x.equipo);
  const equipo = filas.filter((x) => x.equipo);
  const cerrada = !!ensayo.cerrado_at;
  const quienAbrio = filas.find((x) => x.user_id === ensayo.abierto_por)?.nombre;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {ensayo.abierto_at
          ? <span className="rounded-full bg-[#14532d] px-3 py-1.5 font-bold text-[#bbf7d0]"><Icono nombre="check" /> Abierto{quienAbrio ? ` por ${quienAbrio}` : ""} a las {horaMx(ensayo.abierto_at)}</span>
          : <span className="rounded-full border border-white/20 px-3 py-1.5 text-texto-2">Aún no se abre</span>}
        {cerrada && <span className="rounded-full bg-white/10 px-3 py-1.5 font-bold"><Icono nombre="candado" /> Lista cerrada a las {horaMx(ensayo.cerrado_at)}</span>}
      </div>
      {puede && ensayo.estado !== "cancelado" && !cerrada && <CheckinGafete pid={pid} rid={rid} />}
      <Card className="grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-5 md:p-4">
        {Object.entries(ASISTENCIA).map(([k, v]) => <div key={k}><p className="text-2xl font-black">{cuenta(k)}</p><p className="text-xs text-texto-3">{v.label}</p></div>)}
        <div><p className="text-2xl font-black">{filas.filter((x) => !x.estado).length}</p><p className="text-xs text-texto-3">Sin marcar</p></div>
      </Card>
      {[["Elenco", elenco], ["Equipo de producción", equipo]].map(([titulo, lista]) => (lista as FilaLista[]).length > 0 && (
        <Card key={titulo as string} className="p-0 md:p-0">
          <p className="px-4 pt-4 text-xs font-bold uppercase tracking-[0.16em] text-texto-3">{titulo as string} · {(lista as FilaLista[]).length}</p>
          <ul className="divide-y divide-white/10">
            {(lista as FilaLista[]).map((x) => <Fila key={x.user_id} x={x} pid={pid} rid={rid} puede={puede && (!cerrada || lider)} />)}
          </ul>
        </Card>
      ))}
      {filas.length === 0 && <Card className="text-sm text-texto-2">Nadie citado a este ensayo.</Card>}
      {ensayo.estado !== "cancelado" && puede && !cerrada && (
        <ActionForm action={cerrarLista} hidden={{ pid, rid }}
          confirm="¿Cerrar la lista? Quienes no tengan registro quedan como falta (se pueden justificar después)."
          submit={<><Icono nombre="candado" /> Cerrar lista</>} submitClass="self-start rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold" />
      )}
      {cerrada && lider && (
        <ActionForm action={reabrirLista} hidden={{ pid, rid }} submit="Abrir la lista otra vez" submitClass="self-start rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold" />
      )}
      <p className="text-xs text-texto-3">Varias personas pueden pasar lista al mismo tiempo; la lista se actualiza sola. Los retardos y faltas sin justificar generan advertencias automáticas según las reglas de la obra.</p>
    </div>
  );
}
