import { memoriaCorta } from "@/lib/memoria";
import { createClient } from "@/lib/supabase/server";

// La liga firmada vale 1 h; se reutiliza 50 min para no firmar de nuevo en cada página (el encabezado la pide siempre).
// Si falla no se guarda: la siguiente página vuelve a intentar.
const firmadas = memoriaCorta<string>(50 * 60_000, 1000);

/** Foto de perfil (bucket privado "avatares") como liga firmada; null si no hay foto. */
export async function avatarUrl(fotoPath: string | null | undefined, segundos = 3600): Promise<string | null> {
  if (!fotoPath) return null;
  const firmar = async () => {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("avatares").createSignedUrl(fotoPath, segundos);
    if (!data?.signedUrl) throw new Error("sin liga");
    return data.signedUrl;
  };
  return (segundos === 3600 ? firmadas.get(fotoPath, firmar) : firmar()).catch(() => null);
}
