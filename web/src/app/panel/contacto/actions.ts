"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markContactRead(_p: { ok: boolean; message: string } | null, f: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_contact_message_read", { target_id: String(f.get("id")) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel/contacto");
  return { ok: true, message: "Leído." };
}
