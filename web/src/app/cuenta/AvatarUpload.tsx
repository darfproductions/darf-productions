"use client";

/* eslint-disable @next/next/no-img-element -- foto privada con URL firmada */
import { compressImage } from "@/lib/image-compress";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setAvatar } from "./actions";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];

// Foto personal: privada (la ven tú, el Director y el equipo de tus obras). No es el retrato de los créditos.
export function AvatarUpload({ uid, url, inicial }: { uid: string; url: string | null; inicial: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    if (!TIPOS.includes(file.type)) return setMsg("Sube una foto JPG, PNG o WebP.");
    setBusy(true);
    try {
      const c = await compressImage(file, "avatar");
      if (c.file.size > 5 * 1024 * 1024) return setMsg("La foto pesa más de 5 MB.");
      file = c.file;
      const path = `${uid}/foto-${Date.now().toString(36)}.${file.type.split("/")[1]}`;
      const { error } = await createClient().storage.from("avatares").upload(path, file, { contentType: file.type });
      if (error) return setMsg("No se pudo subir la foto.");
      const r = await setAvatar(path);
      setMsg([r.message, c.nota].filter(Boolean).join(" · "));
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function quitar() {
    if (!window.confirm("¿Quitar tu foto?")) return;
    setBusy(true);
    const r = await setAvatar(null);
    setBusy(false);
    setMsg(r.message);
    if (r.ok) router.refresh();
  }
  return (
    <div className="flex items-center gap-4">
      <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-telon-2 text-2xl font-black">
        {url ? <img src={url} alt="Tu foto" className="h-full w-full object-cover" /> : inicial}
      </span>
      <span className="flex flex-col items-start gap-1.5">
        <label className="cursor-pointer rounded-full border border-white/30 px-4 py-2 text-sm font-bold hover:border-white/60">
          {busy ? "Un momento…" : url ? "Cambiar foto" : "Subir foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
        </label>
        {url && !busy && <button type="button" onClick={quitar} className="text-xs text-texto-3 underline">Quitar foto</button>}
        {msg && <span className="text-xs text-texto-2">{msg}</span>}
      </span>
    </div>
  );
}
