"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { canjearPreventa } from "@/app/preventa/actions";

/** 0123: "¿Tienes un código de preventa?" en la página de la obra. */
export function CodigoPreventa({ conSesion, aqui }: { conSesion: boolean; aqui: string }) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="self-start text-[13px] font-bold text-obra-acento hover:underline">¿Tienes un código de preventa?</button>;
  if (!conSesion) return <p className="text-[13px]"><Link href={`/entrar?next=${encodeURIComponent(aqui)}`} className="font-bold text-obra-acento underline">Entra a tu cuenta</Link> para usar tu código de preventa.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await canjearPreventa(codigo); setMsg(r); if (r.ok) router.refresh(); }); }} className="flex flex-wrap items-center gap-2">
      <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} aria-label="Código de preventa" placeholder="DARF-XXXXX" autoCapitalize="characters"
        className="w-44 rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm uppercase" />
      <button disabled={pending} className="fb fb-sm fb-luz disabled:opacity-60">{pending ? "Revisando…" : "Usar código"}</button>
      {msg && <p role="status" className={`w-full text-[13px] font-semibold ${msg.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{msg.message}</p>}
    </form>
  );
}
