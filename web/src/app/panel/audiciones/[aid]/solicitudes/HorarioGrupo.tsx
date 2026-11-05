import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { formatSlot } from "@/lib/auditions";
import { avisarTurnos, horarioGrupo, ordenarYAvisar } from "../../actions";

type Grupo = { nombre: string; personas: number; horarios: string[] };

// 0136: horario para todo un grupo (salón, Grupo A/B/C) de un jalón, y luego "ordenar por grupo y avisar turnos":
// a cada quien le llega "Tu turno: Nº 3 · sábado 8 de noviembre, 11:50 a.m.".
export function HorarioGrupo({ aid, grupos, horarios, conNumeros, soloHorario = false }: { aid: string; grupos: Grupo[]; horarios: { id: string; inicia: string; termina?: string | null; sala?: string | null }[]; conNumeros: boolean; soloHorario?: boolean }) {
  if (!grupos.length) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-bold">Horario por grupo</h2>
      <p className="text-sm text-texto-2">Elige un grupo (lo que respondieron a «Grupo») y el horario: se asigna a todos los de ese grupo que aún no se registran en la entrada.</p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {grupos.map((g) => (
          <li key={g.nombre} className="rounded-full bg-sala px-3 py-1.5"><b>{g.nombre}</b> · {g.personas}{g.horarios.length ? ` · ${g.horarios.join(" / ")}` : " · sin horario"}</li>
        ))}
      </ul>
      {horarios.length > 0 ? (
        <ActionForm inline action={horarioGrupo} hidden={{ aid }} submit="Asignar al grupo" submitClass="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">
          <select className={`${input} py-2 text-sm`} name="grupo" required defaultValue="" aria-label="Grupo">
            <option value="" disabled>Grupo…</option>
            {grupos.map((g) => <option key={g.nombre} value={g.nombre}>{g.nombre} ({g.personas})</option>)}
          </select>
          <select className={`${input} py-2 text-sm`} name="slot" defaultValue="" aria-label="Horario">
            <option value="">Sin horario</option>
            {horarios.map((h) => <option key={h.id} value={h.id}>{formatSlot(h.inicia, h.termina)}{h.sala ? ` · ${h.sala}` : ""}</option>)}
          </select>
        </ActionForm>
      ) : (
        <p className="text-sm text-texto-3">Primero agrega horarios en <a href={`/panel/audiciones/${aid}?seccion=inscripcion#horarios`} className="font-bold text-violeta-claro">Configuración, sección Horarios</a>.</p>
      )}
      {!soloHorario && <div className="flex flex-col gap-2 rounded-lg bg-sala p-3">
        <p className="text-sm font-semibold">Orden de la fila y aviso de turnos</p>
        <p className="text-xs text-texto-3">Ordena por grupo (y dentro de cada grupo por horario) y, si quieres, avísales su turno: número y hora a su cuenta.</p>
        <ActionForm inline action={ordenarYAvisar} hidden={{ aid, modo: "grupo" }} confirm="¿Ordenar la fila por grupo? Los números de quienes aún no llegan pueden cambiar." submit="Ordenar por grupo" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="avisar" defaultChecked /> Avisar a cada quien su turno</label>
        </ActionForm>
        {conNumeros && <ActionForm inline action={avisarTurnos} hidden={{ aid }} confirm="¿Mandar a cada quien su número y hora? Les llega un aviso a su cuenta." submit="Solo avisar turnos (sin reordenar)" submitClass="rounded-full border border-white/25 px-4 py-2 text-sm font-bold" />}
      </div>}
    </Card>
  );
}
