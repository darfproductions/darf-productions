"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveDocFile } from "@/app/expediente/actions";
import { createClient } from "@/lib/supabase/client";

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// Subir un documento del expediente (PDF o foto, máx. 10 MB) a la carpeta privada de la persona.
export function DocUpload({ pid, uid, docTypeId, hay }: { pid: string; uid: string; docTypeId: string; hay: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    if (!TIPOS.includes(file.type)) return setMsg("Sube un PDF o una foto (JPG, PNG o WebP).");
    if (file.size > 10 * 1024 * 1024) return setMsg("El archivo pesa más de 10 MB.");
    setBusy(true);
    try {
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
      const path = `${pid}/${uid}/${docTypeId}-${Date.now().toString(36)}.${ext}`;
      const { error } = await createClient().storage.from("expedientes").upload(path, file, { contentType: file.type });
      if (error) return setMsg(`No se pudo subir: ${error.message}`);
      const r = await saveDocFile(pid, uid, docTypeId, path);
      if (!r.ok) return setMsg(r.message ?? "No se pudo guardar.");
      setMsg("Archivo subido.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50">
        {busy ? "Subiendo…" : hay ? "Cambiar archivo" : "Subir archivo"}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span className="text-xs text-texto-2">{msg}</span>}
    </span>
  );
}
