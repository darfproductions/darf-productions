"use client";

import { compressImage } from "@/lib/image-compress";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setProgramFile } from "./actions";

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// Sube el programa como archivo (PDF o imagen, máx. 20 MB) a producciones/<obra>/programa/.
export function ProgramFileUpload({ pid, hay }: { pid: string; hay: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    if (!TIPOS.includes(file.type)) return setMsg("Sube un PDF o una imagen (JPG, PNG o WebP).");
    setBusy(true);
    try {
      if (file.type !== "application/pdf") file = (await compressImage(file, "galeria")).file;
      if (file.size > 20 * 1024 * 1024) return setMsg("El archivo pesa más de 20 MB.");
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
      const path = `${pid}/programa/programa-${Date.now().toString(36)}.${ext}`;
      const { error } = await createClient().storage.from("producciones").upload(path, file, { contentType: file.type });
      if (error) return setMsg(`No se pudo subir: ${error.message}`);
      const r = await setProgramFile(pid, path);
      setMsg(r.message);
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">
        {busy ? "Subiendo…" : hay ? "Cambiar archivo" : "Subir archivo"}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span className="text-sm text-texto-2">{msg}</span>}
    </span>
  );
}
