"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apartarEncuentro } from "@/lib/club-actions";
import type { Encuentro } from "@/lib/fanzone";
import { partesFuncion } from "@/lib/disponibilidad";

// Evento del Club Fan (0075/0080): foto con el elenco después de una función o evento exclusivo.
// Se aparta lugar (si pide registro) y en la entrada se muestra la credencial con QR.
export function EncuentroCard({ e, obra }: { e: Encuentro; obra: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const f = partesFuncion(e.starts_at);
  const lleno = e.libres === 0 && !e.apartado;
  const accion = (on: boolean) =>
    start(async () => {
      const r = await apartarEncuentro(e.id, on);
      setMsg({ ok: r.ok, t: r.message });
      if (r.ok) router.refresh();
    });
  return (
    <li className="flex flex-col gap-3 rounded-[18px] border border-oro/25 bg-sala/40 p-4">
      <div className="flex items-center gap-4">
        <div className="grid justify-items-center border-r border-white/10 pr-4">
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-oro">{f.dia}</small>
          <b className="num text-3xl font-black leading-none">{f.numero}</b>
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-oro">{e.tipo === "foto" ? "Foto con el elenco" : "Evento Club Fan"}</span>
          <strong className="truncate">{e.tipo === "evento" && e.titulo ? e.titulo : obra}</strong>
          <span className="text-[12.5px] text-texto-3">{f.hora}{e.venue ? ` · ${e.venue}` : ""}</span>
          <span className="text-[12.5px] text-oro-claro">{!e.requiere_registro ? "Sin registro: llega con tu credencial" : e.apartado ? "✓ Tienes lugar" : lleno ? "Sin lugares" : `${e.libres} ${e.libres === 1 ? "lugar" : "lugares"}`}</span>
        </div>
      </div>
      {e.descripcion && <p className="text-[12.5px] text-texto-2">{e.descripcion}</p>}
      {e.notas && <p className="text-[12.5px] text-texto-2">{e.notas}</p>}
      {(e.apartado || !e.requiere_registro) && <p className="text-[12.5px] font-bold text-oro-claro">Muestra tu credencial del Club Fan (con QR) en la entrada.</p>}
      {!e.requiere_registro ? null : e.apartado ? (
        <button type="button" disabled={pending} onClick={() => accion(false)} className="fb fb-o fb-sm self-start">{pending ? "…" : "Liberar mi lugar"}</button>
      ) : !e.abierto || lleno ? null : e.con_boleto ? (
        <button type="button" disabled={pending} onClick={() => accion(true)} className="fb fb-fz fb-sm self-start">{pending ? "…" : "Apartar mi lugar"}</button>
      ) : (
        <Link href={`/producciones/${e.production_id}#funciones`} className="text-[12.5px] font-bold text-oro-claro underline">Necesitas boleto para esta función →</Link>
      )}
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{msg.t}</p>}
    </li>
  );
}
