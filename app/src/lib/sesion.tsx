import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "~/lib/supabase";

// Sesión de Supabase para toda la app. `cargando` mientras se lee la sesión guardada en el teléfono.

type Sesion = { sesion: Session | null; cargando: boolean };
const Ctx = createContext<Sesion>({ sesion: null, cargando: true });

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion>({ sesion: null, cargando: true });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEstado({ sesion: data.session, cargando: false }));
    const { data } = supabase.auth.onAuthStateChange((_e, sesion) => setEstado({ sesion, cargando: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={estado}>{children}</Ctx.Provider>;
}

export function useSesion(): Sesion {
  return useContext(Ctx);
}

/** Nombre para saludar: el que guardó al registrarse, si no, la parte de su correo. */
export function nombreDe(sesion: Session | null): string | null {
  if (!sesion) return null;
  const meta = sesion.user.user_metadata as { nombre?: string; full_name?: string; name?: string };
  const n = meta.nombre ?? meta.full_name ?? meta.name ?? sesion.user.email?.split("@")[0] ?? null;
  return n ? n.split(" ")[0] : null;
}
