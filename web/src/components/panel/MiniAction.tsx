"use client";

import { useActionState } from "react";

type State = { ok: boolean; message: string } | null;

// Botón chico (×, ↑, chip) que llama a una acción del servidor. No muestra nada si sale bien
// (la página se actualiza sola), pero si falla dice por qué en vez de quedarse callado.
export function MiniAction({
  action,
  hidden,
  confirm,
  className,
  buttonClass,
  label,
  ariaLabel,
  children,
}: {
  action: (prev: State, f: FormData) => Promise<State>;
  hidden?: Record<string, string>;
  confirm?: string;
  className?: string;
  buttonClass?: string;
  label: React.ReactNode;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, null);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={className}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button disabled={pending} className={buttonClass} aria-label={ariaLabel}>{label}</button>
      {state && !state.ok && <span role="alert" className="text-xs font-semibold text-[#fecdd3]">{state.message}</span>}
    </form>
  );
}
