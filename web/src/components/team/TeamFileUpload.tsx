"use client";

import { useState } from "react";
import { compressImage } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";
import { TEAM_FILE_TYPES, teamFilePath } from "@/lib/team-rules";

// Sube un archivo al espacio privado del equipo y deja su ruta en un campo oculto del formulario.
export function TeamFileUpload({ pid, carpeta, name, label = "Subir archivo" }: { pid: string | null; carpeta: "materiales" | "juntas"; name: string; label?: string }) {
  const [path, setPath] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    if (!TEAM_FILE_TYPES.includes(file.type)) return setMsg("Tipo no permitido: PDF, Word, Excel, PowerPoint, texto, audio, imagen o video mp4.");
    setBusy(true);
    try {
      if (file.type.startsWith("image/")) file = (await compressImage(file, "documento")).file;
      if (file.size > 50 * 1024 * 1024) return setMsg("Pesa más de 50 MB. Para videos largos usa un enlace.");
      const p = teamFilePath(pid, carpeta, file.name);
      const { error } = await createClient().storage.from("equipo").upload(p, file, { contentType: file.type });
      if (error) return setMsg(`No se pudo subir: ${error.message}`);
      setPath(p);
      setMsg(`Listo: ${file.name}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name={name} value={path} />
      <label className="cursor-pointer rounded-full border border-white/25 px-4 py-2 font-bold hover:border-white/50">
        {busy ? "Subiendo…" : path ? "Cambiar archivo" : label}
        <input type="file" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span className="text-xs text-texto-2">{msg}</span>}
    </span>
  );
}
