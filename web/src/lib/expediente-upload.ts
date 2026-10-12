import { compressImage } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";

// Sube un archivo a la carpeta privada de la persona en "expedientes" (<obra>/<usuario>/…).
// PDF o foto (las fotos se comprimen), máximo 10 MB. Se usa desde el navegador.

export const TIPOS_EXPEDIENTE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const ACCEPT_EXPEDIENTE = TIPOS_EXPEDIENTE.join(",");

export async function subirAExpediente(pid: string, uid: string, prefijo: string, file: File): Promise<{ path: string } | { error: string }> {
  if (!TIPOS_EXPEDIENTE.includes(file.type)) return { error: "Sube un PDF o una foto (JPG, PNG o WebP)." };
  if (file.type !== "application/pdf") file = (await compressImage(file, "documento")).file;
  if (file.size > 10 * 1024 * 1024) return { error: "El archivo pesa más de 10 MB." };
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const path = `${pid}/${uid}/${prefijo}-${Date.now().toString(36)}.${ext}`;
  const { error } = await createClient().storage.from("expedientes").upload(path, file, { contentType: file.type });
  if (error) return { error: "No se pudo subir el archivo. Intenta de nuevo." };
  return { path };
}
