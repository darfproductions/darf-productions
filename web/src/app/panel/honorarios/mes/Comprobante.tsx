"use client";

import { useState, useTransition } from "react";
import { compressImage } from "@/lib/image-compress";
import { peso } from "@/lib/image-compress-rules";
import { createClient } from "@/lib/supabase/client";
import { marcarPagado } from "../actions";

// Marcar pagado (0151). La foto de la transferencia es opcional (Diego): "Marcar pagado" sin foto, o subirla (antes o
// después). La foto se comprime al máximo aquí (solo tiene que existir y leerse) y se guarda en la carpeta privada
// "honorarios" (AAAA-MM/<persona>/…).
export function Comprobante({ mes, persona, pagado, conFoto }: { mes: string; persona: string; pagado: boolean; conFoto: boolean }) {
  const [msg, setMsg] = useState("");
  const [pendiente, start] = useTransition();
  const enviar = (path: string | null, listo: string) => {
    const f = new FormData();
    f.set("mes", mes);
    f.set("persona", persona);
    if (path) f.set("path", path);
    start(async () => {
      const r = await marcarPagado(null, f);
      setMsg(r?.ok ? listo : r?.message ?? "No se pudo marcar.");
    });
  };
  async function subir(file: File) {
    if (!file.type.startsWith("image/")) return setMsg("Sube una foto o captura de la transferencia.");
    setMsg("Comprimiendo…");
    const c = await compressImage(file, "comprobante");
    const ext = c.file.type === "image/webp" ? "webp" : c.file.type === "image/png" ? "png" : "jpg";
    const path = `${mes}/${persona}/transferencia-${Date.now().toString(36)}.${ext}`;
    setMsg(`Subiendo (${peso(c.file.size)})…`);
    const { error } = await createClient().storage.from("honorarios").upload(path, c.file, { contentType: c.file.type });
    if (error) return setMsg("No se pudo subir. Intenta de nuevo.");
    enviar(path, `Listo: comprobante guardado (${peso(c.file.size)}).`);
  }
  return (
    <span className="flex flex-col items-end gap-1">
      {!pagado && (
        <button type="button" disabled={pendiente} onClick={() => enviar(null, "Marcado como pagado.")} className="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-60">
          Marcar pagado
        </button>
      )}
      <label className={`cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold ${pendiente ? "opacity-60" : ""}`}>
        {conFoto ? "Cambiar comprobante" : pagado ? "Subir comprobante (opcional)" : "Subir transferencia (opcional)"}
        <input type="file" accept="image/*" className="sr-only" disabled={pendiente} onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span role="status" className="text-[11px] text-texto-3">{msg}</span>}
    </span>
  );
}
