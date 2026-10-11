"use client";

import { useActionState } from "react";
import { Notice, button } from "@/components/panel/ui";
import type { EditState } from "./actions";

// Formulario del editor: guarda con una acción del servidor y muestra el resultado.
export function EditForm({
  action,
  pid,
  submit = "Guardar",
  children,
  hidden,
}: {
  action: (prev: EditState, f: FormData) => Promise<EditState>;
  pid: string;
  submit?: string;
  children: React.ReactNode;
  hidden?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState<EditState, FormData>(action, null);
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Guardando…" : submit}</button>
        {state && <Notice ok={state.ok}>{state.message}</Notice>}
      </div>
    </form>
  );
}
