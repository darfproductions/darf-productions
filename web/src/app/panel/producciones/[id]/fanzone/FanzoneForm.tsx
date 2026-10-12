"use client";

import { compressImage } from "@/lib/image-compress";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { input } from "@/components/panel/ui";
import { FAN_TIPOS, type FanTipo } from "@/lib/fanzone-rules";
import { createClient } from "@/lib/supabase/client";
import { addFanzoneItem } from "./actions";

const FOTO = ["image/jpeg", "image/png", "image/webp"];

// Agregar un contenido a la Fan Zone. Fotos y documentos se suben primero al bucket de la obra.
export function FanzoneForm({ pid }: { pid: string }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<FanTipo>("video");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const conArchivo = tipo === "foto" || tipo === "documento";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setMsg(null);
    setBusy(true);
    try {
      if (conArchivo) {
        if (!file) return setMsg({ ok: false, text: "Elige el archivo." });
        let subir = file;
        let nota: string | null = null;
        const okTipo = tipo === "foto" ? FOTO.includes(file.type) : file.type === "application/pdf";
        if (!okTipo) return setMsg({ ok: false, text: tipo === "foto" ? "La foto debe ser JPG, PNG o WebP." : "El documento debe ser PDF." });
        if (tipo === "foto") { const c = await compressImage(file, "fanzone"); subir = c.file; nota = c.nota; }
        if (subir.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: "El archivo pesa más de 20 MB." });
        const ext = subir.type === "application/pdf" ? "pdf" : subir.type.split("/")[1];
        const path = `${pid}/fanzone/${tipo}-${Date.now().toString(36)}.${ext}`;
        const up = await createClient().storage.from("gallery").upload(path, subir, { contentType: subir.type });
        if (up.error) return setMsg({ ok: false, text: `No se pudo subir: ${up.error.message}` });
        fd.set("archivo", path);
        if (nota) fd.set("_nota", nota);
      }
      const r = await addFanzoneItem(null, fd);
      setMsg(r ? { ok: r.ok, text: [r.message, fd.get("_nota")].filter(Boolean).join(" · ") } : null);
      if (r?.ok) { form.reset(); setFile(null); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="pid" value={pid} />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FAN_TIPOS) as FanTipo[]).map((t) => (
          <label key={t} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${tipo === t ? "border-texto bg-white/10" : "border-white/20"}`}>
            <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
            {FAN_TIPOS[t].icono} {FAN_TIPOS[t].label}
          </label>
        ))}
      </div>
      <p className="text-xs text-texto-3">{FAN_TIPOS[tipo].help}</p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Título
        <input className={input} name="titulo" required maxLength={160} />
      </label>
      {(tipo === "video" || tipo === "enlace") && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">{tipo === "video" ? "Enlace de YouTube" : "Enlace"}
          <input className={input} name="enlace" required placeholder="https://…" />
        </label>
      )}
      {conArchivo && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Archivo
          <input type="file" accept={tipo === "foto" ? FOTO.join(",") : "application/pdf"} className="text-sm font-normal"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">{tipo === "texto" ? "Texto" : "Descripción (opcional)"}
        <textarea className={input} name="descripcion" rows={tipo === "texto" ? 5 : 2} maxLength={4000} required={tipo === "texto"} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="destacado" /> Destacar (aparece arriba)</label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60">{busy ? "Guardando…" : "Agregar"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
