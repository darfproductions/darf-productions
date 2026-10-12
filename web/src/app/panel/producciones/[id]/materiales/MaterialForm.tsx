"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveMaterial, type MatState } from "./actions";

const field = "rounded-lg border border-white/10 bg-sala px-3 py-2.5 font-normal text-texto";
const TIPOS = ["application/pdf", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/aac", "audio/ogg", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

// Subir material: archivo privado (máx. 50 MB) o enlace. "A quién va" se pasa como children.
export function MaterialForm({ pid, tipos, carpetas, children }: { pid: string; tipos: Record<string, string>; carpetas: string[]; children: React.ReactNode }) {
  const [state, run, pending] = useActionState<MatState, FormData>(saveMaterial, null);
  const [path, setPath] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    if (!TIPOS.includes(file.type)) return setMsg("Tipo no permitido: PDF, audio (mp3, m4a, wav), imagen o video mp4.");
    if (file.size > 50 * 1024 * 1024) return setMsg("Pesa más de 50 MB. Para videos largos usa un enlace de YouTube (no listado) o Drive.");
    setBusy(true);
    try {
      const limpio = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
      const p = `${pid}/${Date.now().toString(36)}-${limpio}`;
      const { error } = await createClient().storage.from("materiales").upload(p, file, { contentType: file.type });
      if (error) return setMsg(`No se pudo subir: ${error.message}`);
      setPath(p);
      setMsg(`Listo: ${file.name}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="archivo_path" value={path} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={`${field} sm:col-span-2`} name="titulo" required placeholder="Ej. Partitura – This Is Me" />
        <select className={field} name="tipo" defaultValue="partitura" aria-label="Tipo">{Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className={field} name="carpeta" list="carpetas" placeholder="Carpeta (opcional): Acto 1" />
        <datalist id="carpetas">{carpetas.map((c) => <option key={c} value={c} />)}</datalist>
        <input className={`${field} sm:col-span-2`} name="descripcion" placeholder="Nota (opcional): practicar compases 12 a 40" />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded-full border border-white/25 px-4 py-2 font-bold hover:border-white/50">
          {busy ? "Subiendo…" : path ? "Cambiar archivo" : "Subir archivo"}
          <input type="file" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
        </label>
        <span className="text-texto-3">o</span>
        <input className={`${field} min-w-0 flex-1`} name="url" type="url" disabled={!!path} placeholder="Enlace https:// (YouTube no listado, Drive…)" />
      </div>
      {msg && <p className="text-xs text-texto-2">{msg}</p>}
      {children}
      <div className="flex items-center gap-3">
        <button disabled={pending || busy} className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60">{pending ? "Guardando…" : "Agregar material"}</button>
        {state && <span className={`text-sm ${state.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
