"use client";

import { useActionState, useState } from "react";
import { BuscarCuenta } from "@/components/panel/BuscarCuenta";
import { InvitacionBotones } from "@/components/panel/InvitacionBotones";
import { Notice, button, input } from "@/components/panel/ui";
import { RoleChecks, type RoleOption } from "@/app/panel/producciones/[id]/permisos/RoleChecks";
import { guardarPuesto, type ObraState } from "@/app/panel/producciones/obra-actions";
import { AREAS } from "@/lib/produccion-nueva-rules";

type Modo = "cuenta" | "invitar" | "vacio";
export type PuestoInicial = {
  id?: string; puesto?: string; area?: string; roles?: string[]; nombre?: string | null; correo?: string | null;
  telefono?: string | null; conCuenta?: boolean;
};

// Un puesto del equipo (0135): quién lo ocupa (con cuenta, con nombre y correo para invitarle, o vacío) y sus permisos.
export function PuestoForm({ pid, obra, roles, p, submit = "Guardar" }: { pid: string; obra: string; roles: RoleOption[]; p?: PuestoInicial; submit?: string }) {
  const [state, run, pending] = useActionState<ObraState, FormData>(guardarPuesto, null);
  const [marcados, setMarcados] = useState<string[]>(p?.roles ?? []);
  const [modo, setModo] = useState<Modo>(p?.conCuenta ? "cuenta" : p?.nombre || p?.correo ? "invitar" : "cuenta");
  const opcion = "flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold has-[:checked]:border-lila has-[:checked]:bg-lila/15";
  return (
    <form action={run} onSubmit={(e) => setMarcados(new FormData(e.currentTarget).getAll("role").map(String))} className="flex flex-col gap-3">
      <input type="hidden" name="pid" value={pid} />
      {p?.id && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Puesto
          <input className={input} name="puesto" required maxLength={80} defaultValue={p?.puesto ?? ""} placeholder="Ej. Dirección vocal" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Área
          <select className={input} name="area" defaultValue={p?.area ?? "creativo"}>
            {AREAS.map((a) => <option key={a.valor} value={a.valor}>{a.label}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">¿Quién lo ocupa?</legend>
        <div className="flex flex-wrap gap-2">
          <label className={opcion}><input type="radio" name="modo" value="cuenta" checked={modo === "cuenta"} onChange={() => setModo("cuenta")} /> Ya tiene cuenta</label>
          <label className={opcion}><input type="radio" name="modo" value="invitar" checked={modo === "invitar"} onChange={() => setModo("invitar")} /> Aún no tiene cuenta</label>
          <label className={opcion}><input type="radio" name="modo" value="vacio" checked={modo === "vacio"} onChange={() => setModo("vacio")} /> Dejar vacío por ahora</label>
        </div>
        {modo === "cuenta" && (
          <label className="flex max-w-md flex-col gap-1.5 text-sm font-semibold">Busca su nombre o correo
            <BuscarCuenta name="quien" required={false} placeholder={p?.conCuenta && p.nombre ? p.nombre : "Escribe su nombre o correo"} />
            {p?.conCuenta && <span className="text-xs font-normal text-texto-3">Déjalo en blanco para conservar a {p.nombre}.</span>}
          </label>
        )}
        {modo === "invitar" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
              <input className={input} name="nombre" defaultValue={p?.nombre ?? ""} placeholder="Nombre completo" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo <span className="text-xs font-normal text-texto-3">(opcional)</span>
              <input className={input} name="correo" type="email" defaultValue={p?.correo ?? ""} placeholder="Para mandarle la invitación" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono <span className="text-xs font-normal text-texto-3">(opcional)</span>
              <input className={input} name="telefono" type="tel" defaultValue={p?.telefono ?? ""} />
            </label>
          </div>
        )}
        {modo === "vacio" && <p className="text-sm text-texto-3">Queda el hueco con sus permisos listos para cuando lo llenes.</p>}
      </fieldset>
      <RoleChecks roles={roles} checked={p?.roles ?? []} />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Guardando…" : submit}</button>
        {state && <Notice ok={state.ok}>{state.message}</Notice>}
      </div>
      {state?.token && <InvitacionBotones token={state.token} obra={obra} roles={roles.filter((r) => marcados.includes(r.id)).map((r) => r.nombre)} />}
    </form>
  );
}
