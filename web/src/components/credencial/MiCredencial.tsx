"use client";

import { WalletBotones } from "@/components/wallet/WalletBotones";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GafeteVista } from "@/components/gafete/GafeteVista";
import { descargarPase } from "@/components/gafete/gafete-canvas";
import { guardarCompartir, regenerarGafete } from "@/lib/gafete-actions";
import type { MiCredencialVista } from "@/lib/credencial";
import { NIVEL, paseCredencial } from "@/lib/credencial-rules";

// "Mi credencial" (0083): una sola por persona. Se ve como gafete (equipo y elencos, con el sello
// del club si también es socio), credencial dorada (Club Fan) o básica (cuenta). Mismo QR para
// ensayos y eventos; se descarga en PDF. El equipo elige qué ve quien la escanea.
export function MiCredencial({ c, compacto = false, wallet }: { c: MiCredencialVista; compacto?: boolean; /** Wallet (2026-10-14): qué Wallets están listos. */ wallet?: { apple: boolean; google: boolean } }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [estado, guardar, guardando] = useActionState(guardarCompartir, null);
  const [regen, startRegen] = useTransition();
  const [aviso, setAviso] = useState("");
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [abierto]);

  const pase = paseCredencial(c);
  const fan = pase.tema === "fan";
  const n = NIVEL[c.nivel];
  const archivo = c.nivel === "equipo" ? `gafete-darf-${c.codigo}.pdf` : c.nivel === "club" ? `credencial-club-fan-${c.codigo}.pdf` : `credencial-darf-${c.codigo}.pdf`;

  return (
    <>
      {compacto ? (
        <button type="button" onClick={() => setAbierto(true)} className={`fb fb-sm border ${fan ? "border-oro/60 text-oro-claro hover:bg-oro/10" : "border-linea-2 hover:bg-white/5"}`}>{n.boton} con QR →</button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left ${fan ? "border-oro/40 bg-[linear-gradient(160deg,#1a1622,#0b0910)] hover:border-oro/70" : "border-linea bg-telon hover:bg-telon-2"}`}>
          <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${fan ? "bg-[linear-gradient(135deg,#8a6b1f,#d7bb5f,#f3e3a3)] text-sala" : "bg-[linear-gradient(135deg,#340feb,#830886,#d20122)] text-white"}`}><IconoCredencial /></span>
          <span className="flex flex-col gap-0.5">
            <span className={`font-bold ${fan ? "text-oro-claro" : ""}`}>{n.boton} →</span>
            <span className="text-xs text-texto-2">{n.ayuda}{c.nivel === "equipo" && c.socio ? " Incluye tu sello del Club Fan." : ""}</span>
          </span>
        </button>
      )}
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={n.boton} className="fixed inset-0 z-[60] flex flex-col items-center gap-5 overflow-y-auto bg-[#050407]/95 px-4 py-8 backdrop-blur">
          <button type="button" onClick={() => setAbierto(false)} className="self-end rounded-full border border-white/25 px-4 py-2 text-sm font-bold" autoFocus>Cerrar ✕</button>
          <GafeteVista p={pase} />
          {wallet && <WalletBotones apple={wallet.apple ? "/cuenta/wallet/apple/credencial" : null} google={wallet.google ? "/cuenta/wallet/google/credencial" : null} />}
          <p className="max-w-[340px] text-center text-sm text-texto-2">Es tu único código: sirve en ensayos y en la entrada de los eventos. Sube el brillo de tu pantalla para que el QR se lea fácil.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" disabled={bajando} onClick={async () => { setBajando(true); try { await descargarPase(pase, archivo); } finally { setBajando(false); } }} className="fb fb-claro fb-sm">{bajando ? "Preparando…" : "Descargar PDF"}</button>
            {c.nivel === "equipo" && <button type="button" onClick={() => setAjustes(!ajustes)} aria-expanded={ajustes} className="fb fb-o fb-sm">Qué compartir</button>}
            <a href={c.liga} target="_blank" rel="noreferrer" className="fb fb-o fb-sm">Ver cómo la ven ↗</a>
          </div>
          {ajustes && c.nivel === "equipo" && (
            <div className="flex w-[min(420px,92vw)] flex-col gap-4 rounded-[22px] border border-linea-2 bg-telon p-5 text-sm">
              <p className="text-texto-2">Cuando alguien escanee tu gafete con su celular verá tu nombre y tu papel, y además:</p>
              <form action={guardar} className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2"><input type="checkbox" name="telefono" defaultChecked={c.compartir_telefono} /> Mi teléfono</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="correo" defaultChecked={c.compartir_correo} /> Mi correo</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="instagram" defaultChecked={c.compartir_instagram} /> Mi Instagram (de mi perfil profesional)</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="perfil" defaultChecked={c.compartir_perfil} /> Liga a mi perfil profesional (si es público)</label>
                <p className="text-xs text-texto-3">Si eres menor de edad, tu teléfono y correo no se comparten aunque los marques.</p>
                <button disabled={guardando} className="fb fb-luz fb-sm self-start">{guardando ? "Guardando…" : "Guardar"}</button>
                {estado && <p role="status" className={`text-xs ${estado.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{estado.message}</p>}
              </form>
            </div>
          )}
          <button
            type="button"
            disabled={regen}
            onClick={() => {
              if (!window.confirm("¿Hacer un código nuevo? El anterior (y su PDF) dejará de servir.")) return;
              startRegen(async () => { const r = await regenerarGafete(); setAviso(r.message); router.refresh(); });
            }}
            className="text-xs font-bold text-texto-3 underline"
          >
            {regen ? "…" : "Regenerar código"}
          </button>
          {aviso && <p role="status" className="text-xs text-texto-2">{aviso}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Ícono de credencial (tarjeta con foto y renglones), en lugar de emoji. */
function IconoCredencial() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.8 16c.6-1.5 1.6-2.2 2.7-2.2s2.1.7 2.7 2.2" />
      <path d="M14 10h4M14 13h4M14 16h2.5" />
    </svg>
  );
}
