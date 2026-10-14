"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { DayStatus } from "@/lib/audition-rules";
import { deskCheckin, deskStep, swapOrder } from "../../actions";
import { Icono } from "@/components/Icono";

const main = "rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-60";
const ghost = "rounded-full border border-white/25 px-2.5 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Botones del día para una persona: Llegó → Entró → Terminó, y deshacer el último paso.
export function StepButtons({ aid, app, nombre, status }: { aid: string; app: string; nombre: string; status: DayStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; result?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if ((r.ok === false || r.result === "error") && r.message) window.alert(r.message);
      router.refresh();
    });
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {status === "pendiente" && (
        <button type="button" disabled={pending} className={main} onClick={() => window.confirm(`¿Registrar la llegada de ${nombre}?`) && run(() => deskCheckin(aid, app))}>Llegó</button>
      )}
      {status === "llego" && <button type="button" disabled={pending} className={main} onClick={() => run(() => deskStep(aid, app, "entro"))}>Entró</button>}
      {status === "en_sala" && <button type="button" disabled={pending} className={main} onClick={() => run(() => deskStep(aid, app, "termino"))}>Terminó</button>}
      {(status === "en_sala" || status === "termino") && (
        <button type="button" disabled={pending} className={ghost} title="Deshacer el último paso" aria-label="Deshacer el último paso"
          onClick={() => window.confirm(`¿Deshacer el último paso de ${nombre}?`) && run(() => deskStep(aid, app, "deshacer"))}><Icono nombre="deshacer" /></button>
      )}
    </span>
  );
}

// Subir / bajar en la lista previa (intercambia el número con la persona de al lado).
export function OrderButtons({ aid, app, prev, next }: { aid: string; app: string; prev: string | null; next: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const swap = (other: string) => start(async () => {
    const r = await swapOrder(aid, app, other);
    if (!r.ok && r.message) window.alert(r.message);
    router.refresh();
  });
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" disabled={pending || !prev} className={ghost} aria-label="Subir" onClick={() => prev && swap(prev)}><Icono nombre="flecha-arriba" /></button>
      <button type="button" disabled={pending || !next} className={ghost} aria-label="Bajar" onClick={() => next && swap(next)}><Icono nombre="flecha-abajo" /></button>
    </span>
  );
}
