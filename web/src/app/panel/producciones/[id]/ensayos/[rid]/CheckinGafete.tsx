"use client";

/* eslint-disable @next/next/no-img-element -- foto firmada del integrante */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QrScanner } from "@/components/panel/QrScanner";
import { iniciales } from "@/lib/gafete-rules";
import { checkinGafete, type CheckinResult } from "../actions";

const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "");

const ESTILO: Record<string, { titulo: (r: CheckinResult) => string; color: string }> = {
  presente: { titulo: (r) => `Presente · ${hora(r.llegada)}`, color: "border-exito bg-exito/15 text-exito" },
  retardo: { titulo: (r) => `Retardo · ${r.minutos ?? 0} min`, color: "border-aviso bg-aviso/15 text-aviso" },
  ya: { titulo: (r) => `Ya registrado a las ${hora(r.llegada)}`, color: "border-white/30 bg-white/5 text-texto-2" },
  no_citado: { titulo: () => "No está citado a este ensayo", color: "border-[#ff8fa3] bg-[#ff8fa3]/10 text-[#ff8fa3]" },
  no_encontrado: { titulo: () => "Gafete no encontrado", color: "border-[#ff8fa3] bg-[#ff8fa3]/10 text-[#ff8fa3]" },
};

function bip(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
  } catch { /* sin sonido */ }
}

// Mesa de asistencia (0078): la computadora o el celular lee el gafete de cada integrante al llegar.
export function CheckinGafete({ pid, rid }: { pid: string; rid: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<CheckinResult | null>(null);
  const [lista, setLista] = useState<CheckinResult[]>([]);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto]);

  async function leer(code: string) {
    setBusy(true);
    try {
      const r = await checkinGafete(pid, rid, code);
      setUltimo(r);
      bip(r.ok && (r.resultado === "presente" || r.resultado === "retardo"));
      if (r.ok && (r.resultado === "presente" || r.resultado === "retardo")) { setLista((l) => [r, ...l].slice(0, 8)); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  const e = ultimo?.resultado ? ESTILO[ultimo.resultado] : null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="fb fb-luz fb-sm self-start">Checar con gafete</button>
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Checar asistencia con gafete" className="fixed inset-0 z-[60] overflow-y-auto bg-sala px-5 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-black uppercase">Asistencia con gafete</p>
              <button type="button" onClick={() => setAbierto(false)} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Terminar ✕</button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <QrScanner onCode={leer} busy={busy} placeholder="DRF-XXXX o liga del gafete" />
              <div className="flex flex-col gap-4">
                {ultimo && (
                  <div role="status" className={`flex items-center gap-4 rounded-[22px] border-2 p-5 ${e?.color ?? ""}`}>
                    {ultimo.ok && ultimo.resultado === "no_encontrado" ? (
                      <span className="flex flex-col gap-1">
                        <strong className="text-2xl">{e?.titulo(ultimo)}</strong>
                        <span className="text-sm text-texto-2">Revisa el código o pide a la persona que abra su gafete en Mi cuenta.</span>
                      </span>
                    ) : ultimo.ok ? (
                      <>
                        <span className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-telon-2">
                          {ultimo.fotoUrl ? <img src={ultimo.fotoUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-2xl font-black text-texto">{iniciales(ultimo.nombre ?? "")}</span>}
                        </span>
                        <span className="flex flex-col gap-1">
                          <strong className="text-2xl text-texto">{ultimo.nombre || "—"}</strong>
                          <span className="text-lg font-bold">{e?.titulo(ultimo)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-bold">{ultimo.message}</span>
                    )}
                  </div>
                )}
                {lista.length > 0 && (
                  <ul className="flex flex-col divide-y divide-white/10 rounded-[18px] border border-linea text-sm">
                    {lista.map((x, i) => (
                      <li key={i} className="flex justify-between gap-3 px-4 py-2.5">
                        <span>{x.nombre}</span>
                        <span className={x.resultado === "retardo" ? "text-aviso" : "text-exito"}>{x.resultado === "retardo" ? `${x.minutos} min tarde` : "a tiempo"} · {hora(x.llegada)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-texto-3">Revisa que la foto corresponda a la persona. Si la cámara falla, escribe el código corto de su gafete (DRF-XXXX).</p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
