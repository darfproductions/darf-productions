"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { salirDelClub } from "@/lib/club-actions";

// "Salir del Club Fan" (0095), en Mi cuenta. Pide confirmar: el número de socio no se recupera.
export function SalirClub({ numero }: { numero: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`¿Salir del Club Fan? Dejas de ver la Fan Zone, las preventas y los eventos del club, y pierdes tu número de socio ${numero} (si vuelves, te toca uno nuevo). Tus boletos y lugares apartados se quedan.`)) return;
          start(async () => {
            const r = await salirDelClub();
            setMsg({ ok: r.ok, t: r.message });
            if (r.ok) router.refresh();
          });
        }}
        className="text-sm font-bold text-texto-3 underline underline-offset-4 hover:text-texto disabled:opacity-60"
      >
        {pending ? "Un momento…" : "Salir del Club Fan"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-texto-2" : "text-[#ff8fa3]"}`}>{msg.t}</p>}
    </div>
  );
}
