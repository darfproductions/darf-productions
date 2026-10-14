"use client";

/* eslint-disable @next/next/no-img-element -- foto firmada de la persona */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QrScanner } from "@/components/panel/QrScanner";
import type { Lectura } from "@/lib/acceso-rules";
import { iniciales } from "@/lib/gafete-rules";
import { bip } from "@/lib/aviso-sonido";
import { Icono } from "@/components/Icono";

const COLOR: Record<NonNullable<Lectura["tono"]>, string> = {
  ok: "border-exito bg-exito/15 text-exito",
  aviso: "border-aviso bg-aviso/15 text-aviso",
  neutro: "border-white/30 bg-white/5 text-texto-2",
  error: "border-[#ff8fa3] bg-[#ff8fa3]/10 text-[#ff8fa3]",
};


// Mesa de entrada a pantalla completa: la cámara (o el código escrito) lee un QR, se ve grande la
// foto, el nombre y el resultado, con un sonido corto, y la lista de las últimas llegadas.
// La usan el gafete en ensayos (0078) y la credencial del Club Fan en sus eventos (0080).
export function EscanerAcceso({ boton, titulo, placeholder, ayuda, leer, botonClass = "fb fb-luz fb-sm self-start" }: {
  boton: string; titulo: string; placeholder: string; ayuda: string;
  leer: (code: string) => Promise<Lectura>; botonClass?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Lectura | null>(null);
  const [lista, setLista] = useState<Lectura[]>([]);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto]);

  async function onCode(code: string) {
    setBusy(true);
    try {
      const r = await leer(code);
      setUltimo(r);
      bip(r.ok && !!r.llegada);
      if (r.ok && r.llegada) { setLista((l) => [r, ...l].slice(0, 8)); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  const persona = ultimo?.ok && ultimo.nombre !== undefined;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={botonClass}>{boton}</button>
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[60] overflow-y-auto bg-sala px-5 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-black uppercase">{titulo}</p>
              <button type="button" onClick={() => setAbierto(false)} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Terminar <Icono nombre="x" /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <QrScanner onCode={onCode} busy={busy} placeholder={placeholder} />
              <div className="flex flex-col gap-4">
                {ultimo && (
                  <div role="status" className={`flex items-center gap-4 rounded-[22px] border-2 p-5 ${COLOR[ultimo.ok ? ultimo.tono ?? "neutro" : "error"]}`}>
                    {persona && (
                      <span className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-telon-2">
                        {ultimo.fotoUrl ? <img src={ultimo.fotoUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-2xl font-black text-texto">{iniciales(ultimo.nombre ?? "")}</span>}
                      </span>
                    )}
                    <span className="flex flex-col gap-1">
                      {persona && <strong className="text-2xl text-texto">{ultimo.nombre || "—"}</strong>}
                      <span className={persona ? "text-lg font-bold" : "text-2xl font-bold"}>{ultimo.ok ? ultimo.titulo : ultimo.message}</span>
                      {ultimo.ok && ultimo.detalle && <span className="text-sm text-texto-2">{ultimo.detalle}</span>}
                    </span>
                  </div>
                )}
                {lista.length > 0 && (
                  <ul aria-label="Últimas llegadas" className="flex flex-col divide-y divide-white/10 rounded-[18px] border border-linea text-sm">
                    {lista.map((x, i) => (
                      <li key={i} className="flex justify-between gap-3 px-4 py-2.5">
                        <span>{x.nombre}</span>
                        <span className={x.tono === "aviso" ? "text-aviso" : "text-exito"}>{x.llegada}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-texto-3">{ayuda}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
