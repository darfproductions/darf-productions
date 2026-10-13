"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Equipo DARF (0063): solo el Director (la base lo revisa con RLS).

export type TeamState = { ok: boolean; message: string } | null;

const refresh = () => {
  revalidatePath("/panel/personas/equipo");
  revalidatePath("/nosotros");
};

export async function addTeamMember(_p: TeamState, f: FormData): Promise<TeamState> {
  const person_id = String(f.get("person") ?? "");
  const cargo = String(f.get("cargo") ?? "").trim();
  if (!person_id) return { ok: false, message: "Elige a la persona." };
  if (!cargo) return { ok: false, message: "Escribe su cargo." };
  const supabase = await createClient();
  const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("team_members").insert({ person_id, cargo, orden: (count ?? 0) + 1 });
  if (error) return { ok: false, message: error.code === "23505" ? "Esa persona ya está en el equipo." : error.message };
  refresh();
  return { ok: true, message: "Agregado al equipo." };
}

export async function saveTeamMember(_p: TeamState, f: FormData): Promise<TeamState> {
  const id = String(f.get("id") ?? "");
  const cargo = String(f.get("cargo") ?? "").trim();
  const orden = Number(f.get("orden"));
  if (!cargo) return { ok: false, message: "Escribe el cargo." };
  if (!Number.isInteger(orden)) return { ok: false, message: "El orden debe ser un número entero." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("team_members").update({ cargo, orden, visible: f.get("visible") === "on" }, { count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, message: error?.message ?? "No tienes permiso." };
  refresh();
  return { ok: true, message: "Guardado." };
}

export async function removeTeamMember(_p: TeamState, f: FormData): Promise<TeamState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("team_members").delete({ count: "exact" }).eq("id", String(f.get("id") ?? ""));
  if (error || !count) return { ok: false, message: error?.message ?? "No tienes permiso." };
  refresh();
  return { ok: true, message: "Quitado del equipo." };
}
