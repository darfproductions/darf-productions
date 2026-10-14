"use client";

import { useEffect, useRef, useState } from "react";
import { input } from "@/components/panel/ui";
import { decidir, estadoInicial, PAUSA_MS, registrar } from "@/lib/escaner-rules";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }
}

// Lector de QR (puerta de funciones, registro de audiciones, ensayos y eventos): cámara del celular con
// el lector del navegador o jsQR (iPhone), o código escrito. Automático con pausa (2026-10-14): después
// de cada lectura se detiene un momento mientras se ve el resultado y no lee nada mientras se procesa;
// un código ya leído en esta sesión llama a onRepetido (si se da) en lugar de mandarse otra vez.
export function QrScanner({ onCode, onRepetido, busy, placeholder = "Código del QR" }: {
  onCode: (code: string) => void; onRepetido?: (code: string) => void; busy?: boolean; placeholder?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [camara, setCamara] = useState<"off" | "on" | "sin-soporte">("off");
  const [manual, setManual] = useState("");
  const [pausado, setPausado] = useState(false);
  const estado = useRef(estadoInicial());
  const ocupado = useRef(!!busy);
  const cb = useRef({ onCode, onRepetido });
  useEffect(() => {
    cb.current = { onCode, onRepetido };
    ocupado.current = !!busy;
  }, [onCode, onRepetido, busy]);

  function emitir(token: string, manualmente = false) {
    if (!manualmente && ocupado.current) return;
    const ahora = Date.now();
    const que = decidir(estado.current, token, ahora, manualmente);
    if (que === "ignorar") return;
    registrar(estado.current, token, ahora);
    setPausado(true);
    setTimeout(() => setPausado(false), PAUSA_MS);
    const t = token.trim();
    if (que === "repetido" && cb.current.onRepetido) cb.current.onRepetido(t);
    else cb.current.onCode(t);
  }

  useEffect(() => {
    if (camara !== "on") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const Det = window.BarcodeDetector;
    const nativo = Det ? new Det({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas");
    const leer = async (v: HTMLVideoElement): Promise<string | null> => {
      if (nativo) {
        const codes = await nativo.detect(v).catch(() => []);
        return codes[0]?.rawValue ?? null;
      }
      const { default: jsQR } = await import("jsqr");
      const w = 480;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || w;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      return jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const token = await leer(video.current);
          if (token) emitir(token);
        }, 400);
      })
      .catch(() => setCamara("sin-soporte"));
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camara]);

  return (
    <div className="flex flex-col gap-3">
      {camara === "on" && (
        <div className="relative w-full max-w-md">
          <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-black object-cover" />
          {(pausado || busy) && (
            <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/75 px-4 py-2 text-sm font-bold text-white">
              {busy ? "Revisando…" : "Listo · siguiente persona"}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {camara !== "on" ? (
          <button type="button" className="rounded-full bg-texto px-5 py-3 text-sm font-bold text-sala" onClick={() => setCamara("mediaDevices" in navigator ? "on" : "sin-soporte")}>Abrir cámara</button>
        ) : (
          <button type="button" className="rounded-full border border-white/25 px-5 py-3 text-sm font-bold" onClick={() => setCamara("off")}>Cerrar cámara</button>
        )}
      </div>
      {camara === "sin-soporte" && (
        <p className="text-sm text-aviso">No se pudo abrir la cámara (revisa que el navegador tenga permiso). Mientras, escribe el código abajo.</p>
      )}
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          emitir(manual, true);
          setManual("");
        }}
      >
        <input className={`${input} flex-1`} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button disabled={busy} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">{busy ? "…" : "Validar"}</button>
      </form>
    </div>
  );
}
