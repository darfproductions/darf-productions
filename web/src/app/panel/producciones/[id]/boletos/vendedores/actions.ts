"use server";

import { correoDeCampo } from "@/lib/cuentas";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarTramos, type Tramo } from "@/lib/comision-rules";

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
  const { data, error } = await supabase.rpc("seller_add_account", { pid, mail: await correoDeCampo(supabase, str(f, "email")) });
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

// ──────── Comisiones (0129) ────────

/** Tramos de la obra (sid vacío) o la tabla propia de un vendedor. Llegan como JSON desde TramosComision. */
export async function guardarTramos(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const sid = str(f, "sid") || null;
  let tramos: Tramo[];
  try { tramos = JSON.parse(str(f, "tramos") || "[]") as Tramo[]; } catch { return { ok: false, message: "Revisa los tramos." }; }
  const mal = validarTramos(tramos);
  if (mal) return { ok: false, message: mal };
  const supabase = await createClient();
  const { error } = await supabase.rpc("comision_guardar", { pid, sid, tramos });
  if (error) return { ok: false, message: error.message };
  return done(pid, sid ? (tramos.length ? "Guardada su regla propia." : "Vuelve a la regla de la obra.") : tramos.length ? "Comisiones guardadas." : "La obra queda sin comisiones.");
}

export async function pagarComision(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const monto = Number(str(f, "monto").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, message: "Escribe cuánto se pagó." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("comision_pagar", { pid, sid: str(f, "sid"), p_monto: monto, p_nota: str(f, "nota") || null });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Pago registrado.");
}

export async function deshacerPago(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("comision_deshacer_pago", { p_id: str(f, "id") });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Pago quitado.");
}
