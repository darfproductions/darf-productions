"use client";

import { useActionState } from "react";
import { Notice, button, input } from "@/components/panel/ui";
import { addMember, type MemberState } from "./actions";
import { RoleChecks, type RoleOption } from "./RoleChecks";
import { InvitacionBotones } from "@/components/panel/InvitacionBotones";

export function AddMemberForm({ pid, roles }: { pid: string; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      <label className="flex max-w-md flex-col gap-1.5 text-sm font-semibold">Correo
        <input className={input} name="email" type="email" required placeholder="persona@correo.com" />
      </label>
      <RoleChecks roles={roles} />
      <button disabled={pending} className={`${button} self-start`}>{pending ? "Agregando…" : "Agregar o invitar"}</button>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      {state?.invitacion && <InvitacionBotones token={state.invitacion.token} obra={state.invitacion.obra} roles={state.invitacion.roles} />}
    </form>
  );
}
