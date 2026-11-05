"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DayStatus } from "@/lib/audition-rules";
import { deskCheckin, deskStep, moverFila, swapOrder } from "../../actions";
import { Icono } from "@/components/Icono";

const main = "rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-60";
const ghost = "rounded-full border border-white/25 px-2.5 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Botones del día para una persona: Llegó → Entró → Terminó, y deshacer el último paso.
// 0131: con la fila en vivo, entrar y terminar los marca "Siguiente"; aquí solo queda Llegó (y deshacer).
export function StepButtons({ aid, app, nombre, status, soloLlegada = false }: { aid: string; app: string; nombre: string; status: DayStatus; soloLlegada?: boolean }) {
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
      {status === "llego" && !soloLlegada && <button type="button" disabled={pending} className={main} onClick={() => run(() => deskStep(aid, app, "entro"))}>Entró</button>}
      {status === "en_sala" && !soloLlegada && <button type="button" disabled={pending} className={main} onClick={() => run(() => deskStep(aid, app, "termino"))}>Terminó</button>}
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

// 0140: mover un turno a mano en la fila (arriba, abajo o al lugar N). Si la persona va en grupo, se mueve todo el turno.
export function MoverTurno({ aid, app, nombre, lugar, total, enGrupo = false }: { aid: string; app: string; nombre: string; lugar: number | null; total: number; enGrupo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const mover = (a: "arriba" | "abajo" | number) => start(async () => {
    const r = await moverFila(aid, app, a);
    if (!r.ok && r.message) window.alert(r.message);
    setAbierto(false); setDestino("");
    router.refresh();
  });
  const quien = enGrupo ? `el turno de ${nombre}` : nombre;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={pending || lugar === 1} className={ghost} aria-label={`Subir a ${quien}`} title="Un lugar arriba" onClick={() => mover("arriba")}><Icono nombre="flecha-arriba" /></button>
      <button type="button" disabled={pending || lugar === total} className={ghost} aria-label={`Bajar a ${quien}`} title="Un lugar abajo" onClick={() => mover("abajo")}><Icono nombre="flecha-abajo" /></button>
      {abierto ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const n = Number(destino); if (n >= 1) mover(n); }}>
          <input type="number" min={1} max={total} value={destino} onChange={(e) => setDestino(e.target.value)} autoFocus aria-label={`Lugar para ${quien}`}
            className="w-16 rounded-full border border-white/25 bg-sala px-2 py-1 text-xs" placeholder={lugar ? String(lugar) : "N"} />
          <button type="submit" disabled={pending || !destino} className="rounded-full bg-texto px-2.5 py-1 text-xs font-bold text-sala disabled:opacity-60">Ir</button>
          <button type="button" className={ghost} aria-label="Cancelar" onClick={() => { setAbierto(false); setDestino(""); }}><Icono nombre="x" /></button>
        </form>
      ) : (
        <button type="button" disabled={pending} className={ghost} title="Mover al lugar que escribas" onClick={() => setAbierto(true)}>Mover a…</button>
      )}
    </span>
  );
}
