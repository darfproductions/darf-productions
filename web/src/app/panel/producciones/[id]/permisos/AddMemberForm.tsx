"use client";

import { useActionState } from "react";
import { Notice, button, input } from "@/components/panel/ui";
import { addMember, type MemberState } from "./actions";

export function AddMemberForm({ pid, roles }: { pid: string; roles: { id: string; nombre: string; descripcion: string | null }[] }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pid" value={pid} />
      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo de su cuenta DARF
          <input className={input} name="email" type="email" required placeholder="persona@correo.com" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Rol
          <select className={input} name="role" required defaultValue="">
            <option value="" disabled>Elige…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <button disabled={pending} className={button}>{pending ? "Agregando…" : "Agregar"}</button>
      </div>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}
