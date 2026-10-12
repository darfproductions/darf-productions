"use client";

import { useActionState } from "react";
import { confirmVigente, type FileState } from "@/app/expediente/actions";

// "Mis datos siguen vigentes" para esta obra (el expediente se reusa entre obras).
export function ConfirmVigente({ pid, uid }: { pid: string; uid: string }) {
  const [state, run, pending] = useActionState<FileState, FormData>(confirmVigente, null);
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="uid" value={uid} />
      <button disabled={pending} className="boton-compra rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-60">Sí, mis datos siguen vigentes</button>
      {state && <span className={`text-sm ${state.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{state.message}</span>}
    </form>
  );
}
