"use client";

import { ImageUpload } from "@/components/panel/ImageUpload";
import { revisarPoster, type Formato } from "@/lib/poster";

type Result = { ok: boolean; message: string };

// Un espacio del póster oficial (0093) o del alterno (0124): sube la imagen y revisa su proporción antes de subirla.
export function PosterSlot({ pid, formato, info, save, tiene, alt = false }: { pid: string; formato: Formato; info: boolean; save: (path: string) => Promise<Result>; tiene: boolean; alt?: boolean }) {
  return (
    <ImageUpload productionId={pid} kind="poster" carpeta="kit" base={`poster-${alt ? "alt-" : ""}${formato}${info ? "-info" : ""}`} save={save}
      label={tiene ? "Cambiar" : "Subir"} compact revisar={(w, h) => revisarPoster(formato, w, h)} />
  );
}
