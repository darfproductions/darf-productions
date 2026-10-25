"use server";

import { revalidatePath } from "next/cache";
import { httpsOrNull, LISTAS, parseList, trayectoriaDe, usuarioRed, type Habilidades, type Trayecto } from "@/lib/pro-rules";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { refrescarPublico } from "@/lib/supabase/publico";

// Perfil profesional (0057). Lo usan Mi cuenta y el panel; la base revisa quién puede editar.

type State = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh() {
  revalidatePath("/cuenta/perfil-profesional");
  revalidatePath("/panel/talento", "layout");
  revalidatePath("/artistas", "layout");
  revalidatePath("/producciones", "layout");
  refrescarPublico();
}

/** Crea la fila del perfil si no existe (el slug lo pone la base). */
async function ensure(pid: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pro_profiles").select("person_id").eq("person_id", pid).maybeSingle();
  if (data) return null;
  const { error } = await supabase.from("pro_profiles").insert({ person_id: pid, slug: "" });
  return error ? mensajeError(error) : null;
}

export async function saveProProfile(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const tray = trayectoriaDe(
    f.getAll("t_obra").map((_, i) => ({
      obra: String(f.getAll("t_obra")[i] ?? ""), papel: String(f.getAll("t_papel")[i] ?? ""),
      compania: String(f.getAll("t_compania")[i] ?? ""), anio: String(f.getAll("t_anio")[i] ?? ""),
    })) as Trayecto[],
  );
  if (!tray.ok) return tray;
  const habilidades: Habilidades = { canto: str(f, "canto") || undefined };
  for (const l of LISTAS) { const v = parseList(str(f, l.key)); if (v.length) habilidades[l.key] = v; }
  const youtube = httpsOrNull(str(f, "youtube"));
  const reel = httpsOrNull(str(f, "reel_url"));
  if (youtube === false || reel === false) return { ok: false, message: "Los enlaces deben empezar con https://" };
  const ig = str(f, "instagram"), tk = str(f, "tiktok");
  const instagram = ig ? usuarioRed(ig) : null, tiktok = tk ? usuarioRed(tk) : null;
  if ((ig && !instagram) || (tk && !tiktok)) return { ok: false, message: "Revisa tu usuario de Instagram o TikTok." };
  const semblanza = str(f, "semblanza");
  if (semblanza.length > 3000) return { ok: false, message: "La semblanza es muy larga (máx. 3000)." };

  const err = await ensure(pid);
  if (err) return { ok: false, message: err };
  const supabase = await createClient();
  const row: Record<string, unknown> = {
    semblanza: semblanza || null, trayectoria: tray.items, habilidades, instagram, tiktok, youtube, reel_url: reel,
    publico: f.get("publico") === "on",
  };
  if (f.has("tutor")) row.tutor_autorizado_at = f.get("tutor") === "on" ? new Date().toISOString() : null;
  const { error, count } = await supabase.from("pro_profiles").update(row, { count: "exact" }).eq("person_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar este perfil." };
  refresh();
  return { ok: true, message: "Perfil guardado." };
}

export async function setProRetrato(pid: string, path: string | null): Promise<{ ok: boolean; message: string }> {
  if (path && !path.startsWith(`${pid}/`)) return { ok: false, message: "Ruta no válida." };
  const err = await ensure(pid);
  if (err) return { ok: false, message: err };
  const supabase = await createClient();
  const { data: old } = await supabase.from("pro_profiles").select("retrato_path").eq("person_id", pid).maybeSingle();
  const { error, count } = await supabase.from("pro_profiles").update({ retrato_path: path }, { count: "exact" }).eq("person_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso." };
  if (old?.retrato_path && old.retrato_path !== path) await supabase.storage.from("perfiles").remove([old.retrato_path as string]);
  refresh();
  return { ok: true, message: path ? "Retrato guardado." : "Retrato quitado." };
}

export async function addProPhoto(pid: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/`)) return { ok: false, message: "Ruta no válida." };
  const err = await ensure(pid);
  if (err) return { ok: false, message: err };
  const supabase = await createClient();
  const { count } = await supabase.from("pro_photos").select("id", { count: "exact", head: true }).eq("person_id", pid);
  const { error } = await supabase.from("pro_photos").insert({ person_id: pid, path, orden: (count ?? 0) + 1 });
  if (error) { await supabase.storage.from("perfiles").remove([path]); return { ok: false, message: mensajeError(error) }; }
  refresh();
  return { ok: true, message: "Foto agregada." };
}

export async function removeProPhoto(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { data } = await supabase.from("pro_photos").select("path").eq("id", str(f, "id")).eq("person_id", pid).maybeSingle();
  const { error, count } = await supabase.from("pro_photos").delete({ count: "exact" }).eq("id", str(f, "id")).eq("person_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso." };
  if (data?.path) await supabase.storage.from("perfiles").remove([data.path as string]);
  refresh();
  return { ok: true, message: "Foto quitada." };
}
