"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Preguntas frecuentes de DARFY (staff y Director; la base lo revisa con RLS).
type State = { ok: boolean; message: string } | null;
const CATEGORIAS = ["boletos", "funciones", "audiciones", "pagos", "lugar", "general"];

function datos(f: FormData) {
  const get = (k: string) => String(f.get(k) ?? "").trim();
  const liga = get("liga");
  return {
    pregunta: get("pregunta").slice(0, 200),
    respuesta: get("respuesta").slice(0, 1500),
    palabras: [...new Set(get("palabras").split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean))].slice(0, 40),
    categoria: CATEGORIAS.includes(get("categoria")) ? get("categoria") : "general",
    liga: liga || null,
    orden: Number(get("orden")) || 100,
    activa: f.get("activa") === "on",
  };
}

const listo = (message: string): State => {
  revalidatePath("/panel/ajustes/darfy");
  return { ok: true, message };
};

export async function saveFaq(_p: State, f: FormData): Promise<State> {
  const d = datos(f);
  if (d.pregunta.length < 3 || !d.respuesta) return { ok: false, message: "Escribe la pregunta y la respuesta." };
  if (d.liga && !d.liga.startsWith("/") && !d.liga.startsWith("https://")) return { ok: false, message: "La liga debe empezar con / o https://" };
  const supabase = await createClient();
  const id = String(f.get("id") ?? "");
  const { error } = id ? await supabase.from("darfy_faq").update(d).eq("id", id) : await supabase.from("darfy_faq").insert(d);
  if (error) return { ok: false, message: error.message };
  if (!id && f.get("de_pendiente")) await supabase.from("darfy_unanswered").delete().eq("id", Number(f.get("de_pendiente")));
  return listo(id ? "Guardada." : "Pregunta agregada.");
}

export async function deleteFaq(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("darfy_faq").delete().eq("id", String(f.get("id")));
  if (error) return { ok: false, message: error.message };
  return listo("Borrada.");
}

export async function deleteUnanswered(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const id = String(f.get("id") ?? "");
  const { error } = id === "todas"
    ? await supabase.from("darfy_unanswered").delete().gt("id", 0)
    : await supabase.from("darfy_unanswered").delete().eq("id", Number(id));
  if (error) return { ok: false, message: error.message };
  return listo("Listo.");
}
