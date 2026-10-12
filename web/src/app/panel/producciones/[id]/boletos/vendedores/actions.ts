"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Vendedores de la obra (0050). La base revisa vendedores.gestionar.

type State = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (pid: string, message: string): State => {
  revalidatePath(`/panel/producciones/${pid}/boletos/vendedores`);
  return { ok: true, message };
};

export async function setSellerActive(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const accion = str(f, "accion");
  const supabase = await createClient();
  const { error } = accion === "auto"
    ? await supabase.rpc("seller_reset", { pid, sid: str(f, "sid") })
    : await supabase.rpc("seller_set_active", { pid, sid: str(f, "sid"), on_: accion === "activar" });
  if (error) return { ok: false, message: error.message };
  return done(pid, accion === "activar" ? "Activado." : accion === "auto" ? "Vuelve a la regla del elenco." : "Desactivado.");
}

export async function addAccountSeller(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seller_add_account", { pid, mail: str(f, "email") });
  if (error) return { ok: false, message: error.message };
  return done(pid, `Activado. Su código es ${data as string}.`);
}

export async function addExternalSeller(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seller_add_external", { pid, nombre_: str(f, "nombre") });
  if (error) return { ok: false, message: error.message };
  return done(pid, `Vendedor externo creado con el código ${data as string}.`);
}
