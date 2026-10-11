"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { input } from "@/components/panel/ui";
import { checkIn, type CheckIn } from "./actions";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }
}

const VISTA: Record<string, { bg: string; title: string }> = {
  ok: { bg: "bg-[#14532d]", title: "✓ Puede pasar" },
  ya_usado: { bg: "bg-[#7c2d12]", title: "Ya se usó" },
  cancelado: { bg: "bg-[#5a1a22]", title: "Boleto cancelado" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "QR no válido" },
  error: { bg: "bg-[#5a1a22]", title: "No se pudo validar" },
};

// Puerta: cámara del celular (si el navegador sabe leer QR) o escribir el código.
export function DoorScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const [camara, setCamara] = useState<"off" | "on" | "sin-soporte">("off");
  const [res, setRes] = useState<CheckIn | null>(null);
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();
  const ultimo = useRef<{ token: string; at: number } | null>(null);

  function validar(token: string) {
    const t = token.trim();
    if (!t) return;
    // Evita validar el mismo QR dos veces seguidas mientras sigue frente a la cámara.
    if (ultimo.current && ultimo.current.token === t && Date.now() - ultimo.current.at < 4000) return;
    ultimo.current = { token: t, at: Date.now() };
    start(async () => setRes(await checkIn(t)));
  }

  useEffect(() => {
    if (camara !== "on") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const Det = window.BarcodeDetector;
    if (!Det) return;
    const detector = new Det({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) validar(codes[0].rawValue);
        }, 500);
      })
      .catch(() => setCamara("sin-soporte"));
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camara]);

  const v = res ? VISTA[res.result] : null;
  return (
    <div className="flex flex-col gap-4">
      {res && v && (
        <div role="status" className={`rounded-2xl p-6 text-white ${v.bg}`}>
          <p className="text-3xl font-black">{v.title}</p>
          {"seat_label" in res && res.seat_label && <p className="mt-1 text-xl font-bold">{res.seat_label}{"category" in res && res.category ? ` · ${res.category}` : ""}</p>}
          {"buyer_nombre" in res && res.buyer_nombre && <p className="text-lg">{res.buyer_nombre}</p>}
          {res.result === "error" && <p>{res.message}</p>}
        </div>
      )}
      {camara === "on" && <video ref={video} playsInline muted className="aspect-square w-full max-w-md rounded-2xl bg-black object-cover" />}
      <div className="flex flex-wrap gap-2">
        {camara !== "on" ? (
          <button type="button" className="rounded-full bg-texto px-5 py-3 text-sm font-bold text-sala" onClick={() => setCamara(window.BarcodeDetector ? "on" : "sin-soporte")}>Abrir cámara</button>
        ) : (
          <button type="button" className="rounded-full border border-white/25 px-5 py-3 text-sm font-bold" onClick={() => setCamara("off")}>Cerrar cámara</button>
        )}
      </div>
      {camara === "sin-soporte" && (
        <p className="text-sm text-[#f2b544]">Este navegador no puede leer QR con la cámara (por ejemplo Safari en iPhone). Escribe el código del boleto abajo, o usa Chrome en Android.</p>
      )}
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ultimo.current = null;
          validar(manual);
          setManual("");
        }}
      >
        <input className={`${input} flex-1`} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Código del QR" aria-label="Código del QR" />
        <button disabled={pending} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">{pending ? "…" : "Validar"}</button>
      </form>
    </div>
  );
}
