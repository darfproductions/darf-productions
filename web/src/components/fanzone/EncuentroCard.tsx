"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apartarEncuentro, recordarEvento } from "@/lib/club-actions";
import { partesFuncion } from "@/lib/disponibilidad";
import { ACCESO_EVENTO, TIPOS_EVENTO, accionEvento, type Evento } from "@/lib/eventos-rules";

// Un evento de DARF (0081): por función, presencial o en línea. Apartar lugar, "Recordarme",
// entrar a la transmisión cuando llega la hora, o mostrar la credencial del club en la entrada.
export function EncuentroCard({ e, sesion, socio, mostrarObra = true }: { e: Evento; sesion: boolean; socio: boolean; mostrarObra?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const f = partesFuncion(e.starts_at);
  const accion = accionEvento(e, { sesion, socio });
  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, t: r.message });
      if (r.ok) router.refresh();
    });
  const enLinea = e.tipo === "en_linea";
  return (
    <li id={`e-${e.id}`} className="flex flex-col gap-3 rounded-[18px] border border-oro/25 bg-sala/40 p-4">
      <div className="flex items-center gap-4">
        <div className="grid justify-items-center border-r border-white/10 pr-4">
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-oro">{f.dia}</small>
          <b className="num text-3xl font-black leading-none">{f.numero}</b>
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-oro">
            {e.categoria || TIPOS_EVENTO[e.tipo].label}
            {e.en_vivo && <span className="rounded-full bg-[#d20122] px-2 py-0.5 text-[9px] tracking-[0.12em] text-white">En vivo</span>}
            <span className="rounded-full border border-oro/40 px-2 py-0.5 text-[9px] tracking-[0.12em] text-oro-claro">{ACCESO_EVENTO[e.acceso].corto}</span>
          </span>
          <strong className="truncate">{e.titulo}</strong>
          <span className="text-[12.5px] text-texto-3">{f.hora}{enLinea ? " · En línea" : e.venue ? ` · ${e.venue}` : ""}{mostrarObra && e.obra ? ` · ${e.obra}` : ""}</span>
          {e.requiere_registro && e.cupo != null && !enLinea && (
            <span className="text-[12.5px] text-oro-claro">{e.apartado ? "✓ Tienes lugar" : e.libres === 0 ? "Sin lugares" : `${e.libres} ${e.libres === 1 ? "lugar" : "lugares"}`}</span>
          )}
          {e.apartado && enLinea && <span className="text-[12.5px] text-oro-claro">✓ Registrado</span>}
        </div>
      </div>
      {e.descripcion && <p className="text-[12.5px] text-texto-2">{e.descripcion}</p>}
      {e.notas && <p className="text-[12.5px] text-texto-2">{e.notas}</p>}
      {!enLinea && (e.apartado || (!e.requiere_registro && e.acceso === "club")) && (
        <p className="text-[12.5px] font-bold text-oro-claro">Muestra tu credencial del Club Fan (con QR) en la entrada.</p>
      )}
      {!enLinea && !e.requiere_registro && e.acceso !== "club" && <p className="text-[12.5px] text-texto-2">Entrada libre{e.cupo ? ` hasta llenar el cupo (${e.cupo})` : ""}.</p>}
      {enLinea && !e.liga && <p className="text-[12.5px] text-texto-2">La liga para entrar aparece aquí 15 minutos antes.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {accion === "entrar" && <a href={`/eventos/${e.id}/entrar`} target="_blank" rel="noopener noreferrer" className="fb fb-fz fb-sm">Entrar a la transmisión ↗</a>}
        {accion === "apartar" && <button type="button" disabled={pending} onClick={() => correr(() => apartarEncuentro(e.id, true))} className="fb fb-fz fb-sm">{pending ? "…" : enLinea ? "Registrarme" : "Apartar mi lugar"}</button>}
        {accion === "liberar" && <button type="button" disabled={pending} onClick={() => correr(() => apartarEncuentro(e.id, false))} className="fb fb-o fb-sm">{pending ? "…" : "Liberar mi lugar"}</button>}
        {accion === "recordar" && (
          <button type="button" disabled={pending} onClick={() => correr(() => recordarEvento(e.id, !e.recordar))} aria-pressed={e.recordar} className={`fb fb-sm ${e.recordar ? "fb-o" : "fb-fz"}`}>{pending ? "…" : e.recordar ? "✓ Te recordaremos" : "Recordarme"}</button>
        )}
        {accion === "boleto" && e.production_id && <Link href={`/producciones/${e.production_id}#funciones`} className="text-[12.5px] font-bold text-oro-claro underline">Necesitas boleto para esta función →</Link>}
        {accion === "entrar_sesion" && <Link href="/entrar?next=/eventos" className="fb fb-o fb-sm">Entra para apartar</Link>}
        {accion === "unirse_club" && <Link href="/fan-zone" className="fb fb-o fb-sm">Únete al Club Fan</Link>}
        {accion === "lleno" && <span className="text-[12.5px] text-texto-3">Ya no hay lugares.</span>}
        {accion === "cerrado" && <span className="text-[12.5px] text-texto-3">El registro está cerrado.</span>}
      </div>
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{msg.t}</p>}
    </li>
  );
}
