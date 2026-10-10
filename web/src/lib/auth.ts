import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  rol: "fan" | "staff" | "admin";
};

export type Session = { userId: string; email: string; profile: Profile | null };

/** Usuario con sesión (validada contra Supabase) y su perfil; null si no hay sesión. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, telefono, rol")
    .eq("id", data.user.id)
    .maybeSingle();
  return { userId: data.user.id, email: data.user.email ?? "", profile: profile as Profile | null };
}

/** Para páginas que exigen sesión: si no hay, manda a /entrar y regresa después. */
export async function requireSession(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return session;
}

/** Solo rutas internas, para evitar redirecciones a otros sitios. */
export function safeNext(next: string | null | undefined, fallback = "/cuenta"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
