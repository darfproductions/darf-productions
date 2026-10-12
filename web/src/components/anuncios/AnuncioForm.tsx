"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { button, input, Notice } from "@/components/panel/ui";
import { saveAnuncio } from "@/lib/anuncio-panel-actions";
import { LUGARES_ANUNCIO, TIPOS_ANUNCIO, type AnuncioLugar, type AnuncioTipo } from "@/lib/anuncio-rules";
import type { AnuncioPanel } from "@/lib/anuncios";
import { isoToLocalMx } from "@/lib/dates";
import { compressImage } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";

const FOTO = ["image/jpeg", "image/png", "image/webp"];
const lbl = "flex min-w-0 flex-col gap-1.5 text-sm font-semibold";
const ayuda = "text-xs font-normal text-texto-3";

// Crear o editar un anuncio (0074). La imagen se sube primero al almacenamiento de la obra
// (o de "sitio"); luego se guarda la fila.
export function AnuncioForm({ scope, lugares, a }: { scope: string; lugares: AnuncioLugar[]; a?: AnuncioPanel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setMsg(null);
    setBusy(true);
    try {
      if (file) {
        if (!FOTO.includes(file.type)) return setMsg({ ok: false, text: "La imagen debe ser JPG, PNG o WebP." });
        const c = await compressImage(file, "fanzone");
        const path = `${scope}/anuncios/${Date.now().toString(36)}.${c.file.type.split("/")[1]}`;
        const up = await createClient().storage.from("gallery").upload(path, c.file, { contentType: c.file.type });
        if (up.error) return setMsg({ ok: false, text: `No se pudo subir la imagen: ${up.error.message}` });
        fd.set("imagen_path", path);
      } else if (quitarImagen) {
        fd.set("imagen_path", "");
      }
      const r = await saveAnuncio(null, fd);
      setMsg(r ? { ok: r.ok, text: r.message } : null);
      if (r?.ok) {
        if (!a) form.reset();
        setFile(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="scope" value={scope} />
      {a && <input type="hidden" name="id" value={a.id} />}
      {a?.imagen_path && !quitarImagen && <input type="hidden" name="imagen_path" value={a.imagen_path} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Dónde se ve
          <select name="lugar" defaultValue={a?.lugar ?? lugares[0]} className={input}>
            {lugares.map((l) => <option key={l} value={l}>{LUGARES_ANUNCIO[l]}</option>)}
          </select>
        </label>
        <label className={lbl}>Tipo
          <select name="tipo" defaultValue={a?.tipo ?? "general"} className={input}>
            {(Object.keys(TIPOS_ANUNCIO) as AnuncioTipo[]).map((t) => <option key={t} value={t}>{TIPOS_ANUNCIO[t]}</option>)}
          </select>
        </label>
      </div>
      <label className={lbl}>Título
        <input name="titulo" required maxLength={120} defaultValue={a?.titulo ?? ""} placeholder="Revelación del elenco de Showman" className={input} />
      </label>
      <label className={lbl}>Adelanto <span className={ayuda}>Se ve siempre, también antes de revelarse.</span>
        <textarea name="adelanto" rows={2} maxLength={400} defaultValue={a?.adelanto ?? ""} placeholder="El 10 de enero conoce a quienes darán vida a Showman." className={input} />
      </label>
      <label className={lbl}>Contenido <span className={ayuda}>Se ve hasta la fecha de revelación (o de inmediato si no hay fecha).</span>
        <textarea name="contenido" rows={4} maxLength={2000} defaultValue={a?.contenido ?? ""} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Revelar el <span className={ayuda}>Opcional. Antes de esa fecha se ve la cuenta regresiva.</span>
          <input type="datetime-local" name="revela_at" defaultValue={isoToLocalMx(a?.revela_at ?? null)} className={input} />
        </label>
        <label className={lbl}>Ocultar el <span className={ayuda}>Opcional.</span>
          <input type="datetime-local" name="termina" defaultValue={isoToLocalMx(a?.termina ?? null)} className={input} />
        </label>
        <label className={lbl}>Liga del botón <span className={ayuda}>Opcional: /audiciones o https://…</span>
          <input name="enlace" maxLength={500} defaultValue={a?.enlace ?? ""} className={input} />
        </label>
        <label className={lbl}>Texto del botón
          <input name="boton" maxLength={30} defaultValue={a?.boton ?? ""} placeholder="Ver más" className={input} />
        </label>
      </div>
      <label className={lbl}>Imagen <span className={ayuda}>Opcional (JPG, PNG o WebP); se ve al revelarse.</span>
        <input type="file" accept={FOTO.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm font-normal" />
      </label>
      {a?.imagen_path && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={quitarImagen} onChange={(e) => setQuitarImagen(e.target.checked)} /> Quitar la imagen actual
        </label>
      )}
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="registro" value="1" defaultChecked={a?.registro ?? false} /> Botón &quot;Avísame&quot;: quien se apunte recibe un aviso al revelarse</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="solo_club" value="1" defaultChecked={a?.solo_club ?? false} /> Contenido solo para el Club Fan</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="publicado" value="1" defaultChecked={a?.publicado ?? false} /> Publicado</label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className={button}>{busy ? "Guardando…" : a ? "Guardar anuncio" : "Crear anuncio"}</button>
        {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      </div>
    </form>
  );
}
