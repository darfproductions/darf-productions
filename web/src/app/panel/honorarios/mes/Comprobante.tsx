"use client";

import { useState, useTransition } from "react";
import { compressImage } from "@/lib/image-compress";
import { peso } from "@/lib/image-compress-rules";
import { createClient } from "@/lib/supabase/client";
import { marcarPagado } from "../actions";

// Marcar pagado (0151): Pato sube la foto de la transferencia. Se comprime al máximo aquí (solo tiene que existir y
// leerse), se guarda en la carpeta privada "honorarios" (AAAA-MM/<persona>/…) y queda marcado el pago.
export function Comprobante({ mes, persona, cambiar }: { mes: string; persona: string; cambiar?: boolean }) {
  const [msg, setMsg] = useState("");
  const [pendiente, start] = useTransition();
  async function subir(file: File) {
    setMsg("Comprimiendo…");
    if (!file.type.startsWith("image/")) return setMsg("Sube una foto o captura de la transferencia.");
    const c = await compressImage(file, "comprobante");
    const ext = c.file.type === "image/webp" ? "webp" : c.file.type === "image/png" ? "png" : "jpg";
    const path = `${mes}/${persona}/transferencia-${Date.now().toString(36)}.${ext}`;
    setMsg(`Subiendo (${peso(c.file.size)})…`);
    const { error } = await createClient().storage.from("honorarios").upload(path, c.file, { contentType: c.file.type });
    if (error) return setMsg("No se pudo subir. Intenta de nuevo.");
    const f = new FormData();
    f.set("mes", mes);
    f.set("persona", persona);
    f.set("path", path);
    start(async () => {
      const r = await marcarPagado(null, f);
      setMsg(r?.ok ? `Listo: pagado (comprobante de ${peso(c.file.size)}).` : r?.message ?? "No se pudo marcar.");
    });
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <label className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold ${cambiar ? "border border-white/25" : "bg-texto text-sala"} ${pendiente ? "opacity-60" : ""}`}>
        {cambiar ? "Cambiar comprobante" : "Marcar pagado (sube la transferencia)"}
        <input type="file" accept="image/*" className="sr-only" disabled={pendiente} onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span role="status" className="text-[11px] text-texto-3">{msg}</span>}
    </span>
  );
}
