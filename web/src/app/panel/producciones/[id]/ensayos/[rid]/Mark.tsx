"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ASISTENCIA } from "@/lib/rehearsal-rules";
import { markAttendance } from "../actions";

// Botones de asistencia de una persona. Retardo pregunta los minutos.
export function Mark({ pid, rid, uid, actual }: { pid: string; rid: string; uid: string; actual: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const marcar = (estado: string) => {
    let min: number | undefined;
    if (estado === "retardo") {
      const v = window.prompt("¿Cuántos minutos tarde?", "10");
      if (v === null) return;
      min = Number(v) || undefined;
    }
    start(async () => {
      const r = await markAttendance(pid, rid, uid, estado, min);
      // Si guardó, la acción ya trae la página al día (revalidatePath); refrescar otra vez la dibujaba dos veces.
      if (!r.ok) { if (r.message) window.alert(r.message); router.refresh(); }
    });
  };
  return (
    <span className="flex flex-wrap gap-1.5">
      {Object.entries(ASISTENCIA).map(([k, v]) => (
        <button key={k} type="button" disabled={pending} onClick={() => marcar(k)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${actual === k ? v.cls : "border border-white/20 text-texto-2 hover:border-white/50"}`}>
          {v.label}
        </button>
      ))}
    </span>
  );
}
