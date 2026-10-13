"use client";

import { useActionState } from "react";
import { Notice, button } from "@/components/panel/ui";
import { setMemberRoles, type MemberState } from "./actions";
import { RoleChecks, type RoleOption } from "./RoleChecks";

// Editar los roles de una persona: marcar o desmarcar y guardar.
export function EditRolesForm({ pid, userId, email, roles, current }: { pid: string; userId: string; email: string; roles: RoleOption[]; current: string[] }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(setMemberRoles, null);
  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-3"
      onSubmit={(e) => {
        const marcados = new FormData(e.currentTarget).getAll("role").length;
        if (!marcados && !window.confirm(`¿Quitar todos los roles de ${email} en esta obra?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="email" value={email} />
      <RoleChecks roles={roles} checked={current} />
      <button disabled={pending} className={`${button} self-start`}>{pending ? "Guardando…" : "Guardar roles"}</button>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}
