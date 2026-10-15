"use client";

import { useActionState } from "react";
import { Notice, button } from "@/components/panel/ui";
import { addMember, type MemberState } from "./actions";
import { RoleChecks, type RoleOption } from "./RoleChecks";
import { InvitacionBotones } from "@/components/panel/InvitacionBotones";
import { BuscarCuenta } from "@/components/panel/BuscarCuenta";

export function AddMemberForm({ pid, roles }: { pid: string; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      <label className="flex max-w-md flex-col gap-1.5 text-sm font-semibold">Nombre o correo
        <BuscarCuenta placeholder="Escribe su nombre o su correo" />
        <span className="text-xs font-normal text-texto-3">Si no tiene cuenta, escribe su correo completo y le llega la invitación.</span>
      </label>
      <RoleChecks roles={roles} />
      <button disabled={pending} className={`${button} self-start`}>{pending ? "Agregando…" : "Agregar o invitar"}</button>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      {state?.invitacion && <InvitacionBotones token={state.invitacion.token} obra={state.invitacion.obra} roles={state.invitacion.roles} />}
    </form>
  );
}
