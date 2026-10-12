"use client";

import { useState, useTransition } from "react";
import { recordarPreventa } from "@/lib/club-actions";

// "Activar recordatorio" de la preventa de una obra (0076).
export function BotonRecordatorio({ pid, activo }: { pid: string; activo: boolean }) {
  const [on, setOn] = useState(activo);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <button
        type="button"
        disabled={pending}
        aria-pressed={on}
        onClick={() =>
          start(async () => {
            const r = await recordarPreventa(pid, !on);
            if (r.ok) setOn(!on);
            setMsg(r.message);
          })
        }
        className={`fb fb-sm ${on ? "fb-oro" : "fb-fz"}`}
      >
        {pending ? "…" : on ? "✓ Recordatorio activo" : "Activar recordatorio"}
      </button>
      {msg && <p role="status" className="text-xs text-texto-3">{msg}</p>}
    </div>
  );
}
