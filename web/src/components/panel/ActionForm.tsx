"use client";

import { useActionState } from "react";
import { Notice } from "@/components/panel/ui";

type State = { ok: boolean; message: string } | null;

// Formulario de una acción del panel: confirma si hace falta, guarda y muestra el resultado.
export function ActionForm({
  action,
  hidden,
  confirm,
  submit,
  submitClass = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60",
  children,
  inline,
}: {
  action: (prev: State, f: FormData) => Promise<State>;
  hidden?: Record<string, string>;
  confirm?: string;
  submit: React.ReactNode;
  submitClass?: string;
  children?: React.ReactNode;
  inline?: boolean;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, null);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={inline ? "inline-flex max-w-full flex-wrap items-center gap-2" : "flex flex-col gap-3"}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={submitClass}>{pending ? "Un momento…" : submit}</button>
        {state && <Notice ok={state.ok}>{state.message}</Notice>}
      </div>
    </form>
  );
}
