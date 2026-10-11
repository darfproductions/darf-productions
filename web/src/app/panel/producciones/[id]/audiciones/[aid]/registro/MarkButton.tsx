"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deskCheckin } from "../../actions";

// Marcar llegada desde la lista (sin QR).
export function MarkButton({ pid, aid, app, nombre }: { pid: string; aid: string; app: string; nombre: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-60"
      onClick={() => {
        if (!window.confirm(`¿Registrar la llegada de ${nombre}?`)) return;
        start(async () => {
          const r = await deskCheckin(pid, aid, app);
          if (r.result === "error" && "message" in r) window.alert(r.message);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Llegó"}
    </button>
  );
}
