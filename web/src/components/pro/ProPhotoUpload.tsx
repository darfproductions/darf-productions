"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addProPhoto, setProRetrato } from "@/app/cuenta/perfil-profesional/actions";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];

// Subir retrato o foto de galería del perfil profesional (bucket público 'perfiles', carpeta de la ficha).
export function ProPhotoUpload({ pid, kind, label }: { pid: string; kind: "retrato" | "galeria"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function subir(file: File) {
    setMsg("");
    if (!TIPOS.includes(file.type)) return setMsg("Sube una foto JPG, PNG o WebP.");
    if (file.size > 8 * 1024 * 1024) return setMsg("La foto pesa más de 8 MB.");
    setBusy(true);
    try {
      const path = `${pid}/${kind}-${Date.now().toString(36)}.${file.type.split("/")[1]}`;
      const { error } = await createClient().storage.from("perfiles").upload(path, file, { contentType: file.type });
      if (error) return setMsg(`No se pudo subir: ${error.message}`);
      const r = kind === "retrato" ? await setProRetrato(pid, path) : await addProPhoto(pid, path);
      setMsg(r.message);
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm font-bold hover:border-white/60">
        {busy ? "Subiendo…" : label}
        <input type="file" accept={TIPOS.join(",")} className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span className="text-xs text-texto-2">{msg}</span>}
    </span>
  );
}
