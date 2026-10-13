"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Programa digital (0048). La base revisa programa.editar en la obra.

export type ProgState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (pid: string, message: string): ProgState => {
  revalidatePath(`/panel/producciones/${pid}/programa`);
  revalidatePath(`/programa/${pid}`);
  return { ok: true, message };
};

export async function saveProgram(_p: ProgState, f: FormData): Promise<ProgState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.from("program_pages").upsert({
    production_id: pid,
    notas_direccion: str(f, "notas_direccion") || null,
    firma_direccion: str(f, "firma_direccion") || null,
    mensaje: str(f, "mensaje") || null,
    mostrar_canciones: f.get("mostrar_canciones") === "on",
    mostrar_equipos: f.get("mostrar_equipos") === "on",
    mostrar_agradecimientos: f.get("mostrar_agradecimientos") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Programa guardado.");
}

export async function setProgramPublished(_p: ProgState, f: FormData): Promise<ProgState> {
  const pid = str(f, "pid");
  const publicar = str(f, "publicar") === "si";
  const supabase = await createClient();
  const { error } = await supabase.from("program_pages").upsert({ production_id: pid, publicado: publicar, updated_at: new Date().toISOString() });
  if (error) {
    if (error.message.includes("program_pages_modo_listo")) return { ok: false, message: "Primero agrega el enlace o sube el archivo del programa." };
    return { ok: false, message: error.message };
  }
  return done(pid, publicar ? "Programa publicado: ya se abre con el QR." : "Programa oculto.");
}

export async function addSponsor(_p: ProgState, f: FormData): Promise<ProgState> {
  const pid = str(f, "pid");
  const url = str(f, "url");
  if (url && !/^https:\/\/\S+$/i.test(url)) return { ok: false, message: "El enlace debe empezar con https://" };
  const supabase = await createClient();
  const { count } = await supabase.from("program_sponsors").select("id", { count: "exact", head: true }).eq("production_id", pid);
  const { error } = await supabase.from("program_sponsors").insert({ production_id: pid, nombre: str(f, "nombre"), url: url || null, orden: (count ?? 0) + 1 });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Patrocinador agregado. Ahora sube su logo.");
}

export async function removeSponsor(_p: ProgState, f: FormData): Promise<ProgState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("program_sponsors").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return done(pid, "Patrocinador quitado.");
}

export async function setSponsorLogo(pid: string, sid: string, path: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("program_sponsors").update({ logo_path: path }, { count: "exact" }).eq("id", sid).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) {
    await supabase.storage.from("producciones").remove([path]);
    return { ok: false, message: "No tienes permiso para cambiar este logo." };
  }
  revalidatePath(`/panel/producciones/${pid}/programa`);
  revalidatePath(`/programa/${pid}`);
  return { ok: true, message: "Logo guardado." };
}

// Forma del programa: plantilla, enlace o archivo (0049).
export async function setProgramMode(_p: ProgState, f: FormData): Promise<ProgState> {
  const pid = str(f, "pid");
  const modo = str(f, "modo");
  if (!["plantilla", "enlace", "archivo"].includes(modo)) return { ok: false, message: "Elige una forma." };
  const url = str(f, "enlace_url");
  if (modo === "enlace" && !/^https:\/\/\S+$/i.test(url)) return { ok: false, message: "Pega el enlace completo, empezando con https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("program_pages").upsert({
    production_id: pid, modo, ...(modo === "enlace" && { enlace_url: url }), updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message.includes("program_pages_modo_listo")) return { ok: false, message: "Sube el archivo antes de cambiar a esta forma, u oculta el programa primero." };
    return { ok: false, message: error.message };
  }
  return done(pid, modo === "plantilla" ? "Usarás la plantilla de la página." : modo === "enlace" ? "Enlace guardado: “Ver programa” y el QR llevan ahí." : "Listo. Sube el archivo abajo.");
}

export async function setProgramFile(pid: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/programa/`)) return { ok: false, message: "Ruta no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("program_pages").upsert({ production_id: pid, modo: "archivo", archivo_path: path, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/programa`);
  revalidatePath(`/programa/${pid}`);
  return { ok: true, message: "Archivo del programa guardado." };
}
