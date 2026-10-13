import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  rol: "fan" | "staff" | "admin";
  nombres: string | null;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  foto_path: string | null;
};

/** Cookie que deja poner contraseña nueva tras abrir el enlace de recuperación. */
export const RECOVERY_COOKIE = "darf_recovery";
export const RECOVERY_PATH = "/cuenta/contrasena";

export type Session = { userId: string; email: string; profile: Profile | null };

/** Usuario con sesión (validada contra Supabase) y su perfil; null si no hay sesión.
 *  Una sola consulta por página aunque la pidan el encabezado, el layout y la página (cache de React). */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, telefono, rol, nombres, apellidos, fecha_nacimiento, foto_path")
    .eq("id", data.user.id)
    .maybeSingle();
  return { userId: data.user.id, email: data.user.email ?? "", profile: profile as Profile | null };
});

/** Para páginas que exigen sesión: si no hay, manda a /entrar y regresa después. */
export async function requireSession(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return session;
}

export { safeNext } from "@/lib/safe-next";
