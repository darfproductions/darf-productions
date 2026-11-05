"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { asignarHorario } from "../../actions";

// 0140: el horario de una persona, directo en su renglón de la fila (cambia al elegir).
export function HorarioSelect({ aid, app, nombre, actual, horarios }: { aid: string; app: string; nombre: string; actual: string | null; horarios: { id: string; texto: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={`Horario de ${nombre}`}
      value={actual ?? ""}
      disabled={pending}
      onChange={(e) => start(async () => {
        const r = await asignarHorario(aid, app, e.target.value || null);
        if (!r.ok && r.message) window.alert(r.message);
        router.refresh();
      })}
      className="max-w-[12rem] rounded-full border border-white/25 bg-sala px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
    >
      <option value="">Sin horario</option>
      {horarios.map((h) => <option key={h.id} value={h.id}>{h.texto}</option>)}
    </select>
  );
}
