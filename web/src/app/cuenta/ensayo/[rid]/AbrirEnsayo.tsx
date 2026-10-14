"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abrirEnsayo } from "@/app/panel/producciones/[id]/ensayos/actions";
import { Icono } from "@/components/Icono";

// El encargado abre el ensayo: queda presente y ya puede pasar lista (0099).
export function AbrirEnsayo({ pid, rid }: { pid: string; rid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await abrirEnsayo(pid, rid);
        setMsg(r.ok ? null : r.message);
        router.refresh();
      })} className="inline-flex min-h-12 items-center gap-2 self-start rounded-full bg-texto px-6 py-3 text-base font-bold text-sala disabled:opacity-60">
        <Icono nombre="candado" /> {pending ? "Abriendo…" : "Abrir ensayo y pasar lista"}
      </button>
      {msg && <p role="alert" className="text-sm font-semibold text-aviso">{msg}</p>}
    </div>
  );
}
