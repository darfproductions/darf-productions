import { createClient } from "@/lib/supabase/server";

/** Foto de perfil (bucket privado "avatares") como liga firmada; null si no hay foto. */
export async function avatarUrl(fotoPath: string | null | undefined, segundos = 3600): Promise<string | null> {
  if (!fotoPath) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("avatares").createSignedUrl(fotoPath, segundos);
  return data?.signedUrl ?? null;
}
