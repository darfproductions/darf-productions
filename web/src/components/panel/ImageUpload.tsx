"use client";

import { compressImage } from "@/lib/image-compress";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { checkImage, IMAGE_RULES, storagePath, type ImageKind } from "@/lib/image-rules";
import { createClient } from "@/lib/supabase/client";

type Result = { ok: boolean; message: string };

/** Mide la imagen en el navegador (y si es logo, cuánta transparencia tiene). */
async function measure(file: File, withAlpha: boolean) {
  const bmp = await createImageBitmap(file);
  let transparent: number | undefined;
  if (withAlpha) {
    const w = 200;
    const h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bmp, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) n++;
      transparent = n / (w * h);
    }
  }
  const out = { width: bmp.width, height: bmp.height, transparent };
  bmp.close();
  return out;
}

// Subir una imagen: se valida aquí, se sube directo al Storage con la sesión de
// quien la sube (la base revisa que tenga permiso en ESA carpeta) y luego una
// acción del servidor guarda la ruta.
export function ImageUpload({
  productionId,
  kind,
  carpeta,
  bucket = "producciones",
  base,
  save,
  label,
  compact,
}: {
  productionId: string;
  kind: ImageKind;
  carpeta: "kit" | "creditos" | "galeria" | "programa";
  bucket?: "producciones" | "gallery";
  base: string;
  save: (path: string) => Promise<Result>;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const rule = IMAGE_RULES[kind];

  async function onFile(file: File) {
    setMsg(null);
    setBusy(true);
    try {
      const dims = await measure(file, kind === "logo");
      // Se comprime antes de subir; el tamaño máximo se revisa sobre la foto ya optimizada.
      const c = await compressImage(file, kind);
      const check = checkImage(kind, { type: file.type, size: c.file.size, ...dims });
      if (!check.ok) {
        setMsg({ ok: false, lines: check.errors });
        return;
      }
      const path = storagePath(productionId, carpeta, base, c.file.type);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, c.file, { contentType: c.file.type, upsert: false });
      if (error) {
        setMsg({ ok: false, lines: [`No se pudo subir: ${error.message}`] });
        return;
      }
      const res = await save(path);
      setMsg({ ok: res.ok, lines: [res.message, ...(c.nota ? [c.nota] : []), ...check.warnings] });
      if (res.ok) router.refresh();
    } catch {
      setMsg({ ok: false, lines: ["No se pudo leer la imagen. Prueba con otro archivo."] });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={compact ? "flex flex-col gap-1" : "flex flex-col gap-2"}>
      <label className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-white/25 font-bold hover:border-white/50 ${compact ? "px-3 py-1 text-xs" : "self-start px-4 py-2 text-sm"} ${busy ? "opacity-60" : ""}`}>
        {busy ? "Subiendo…" : (label ?? `Subir ${rule.label.toLowerCase()}`)}
        <input
          ref={input}
          type="file"
          accept={rule.types.join(",")}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>
      {!compact && <p className="text-xs text-texto-3">{rule.hint}</p>}
      {msg && (
        <ul role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-[#bbf7d0]" : "text-[#ffb4c0]"}`}>
          {msg.lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
