"use client";

import { useActionState, useRef } from "react";
import { Notice, button, input } from "@/components/panel/ui";
import { addCredit, type CreditState } from "./actions";

// Agregar a alguien a un grupo. El nombre sugiere personas ya registradas para no duplicarlas.
export type OpcionPersonaje = { id: string; nombre: string; ocupado: string | null };

// 0112: en Reparto, si la obra tiene personajes, se eligen de la lista (uno o varios) en lugar de escribirlos.
export function AddCreditForm({ pid, tipo, papelLabel, listId, personajes = [] }: { pid: string; tipo: string; papelLabel: string | null; listId: string; personajes?: OpcionPersonaje[] }) {
  const conLista = tipo === "reparto" && personajes.length > 0;
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<CreditState, FormData>(async (prev, f) => {
    const r = await addCredit(prev, f);
    if (r?.ok) form.current?.reset();
    return r;
  }, null);
  return (
    <form ref={form} action={run} className="flex flex-col gap-2">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="tipo" value={tipo} />
      <div className={`grid gap-2 ${papelLabel && !conLista ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <input className={input} name="nombre" list={listId} placeholder="Nombre completo (elige de la lista)" autoComplete="off" required />
        {papelLabel && !conLista && <input className={input} name="papel" placeholder={papelLabel} required />}
        <button disabled={pending} className={button}>{pending ? "…" : "Agregar"}</button>
      </div>
      {conLista && <ChecksPersonajes personajes={personajes} />}
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}

/** Casillas de personajes (uno o varios); dice quién ya tiene cada uno. */
export function ChecksPersonajes({ personajes, marcados = [] }: { personajes: OpcionPersonaje[]; marcados?: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-semibold">Personajes (marca uno o varios)</legend>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {personajes.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="personaje" value={p.id} defaultChecked={marcados.includes(p.id)} />
            <span>{p.nombre}{p.ocupado && !marcados.includes(p.id) && <span className="text-xs text-texto-3"> · ya: {p.ocupado}</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
