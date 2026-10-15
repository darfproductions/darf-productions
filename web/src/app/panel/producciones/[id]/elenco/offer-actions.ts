"use server";

import { correoDeCampo } from "@/lib/cuentas";
import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Ofertas de papel (0040). La base revisa el permiso elenco.gestionar de la obra.

export type OfferState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function sendOffer(_p: OfferState, f: FormData): Promise<OfferState> {
  const pid = str(f, "production_id");
  const antes = str(f, "responder_antes");
  const supabase = await createClient();
  const email = await correoDeCampo(supabase, str(f, "email"));
  const { error } = await supabase.rpc("casting_offer_send", {
    p: {
      production_id: pid,
      application_id: str(f, "application_id") || null,
      email: email || null,
      tipo: str(f, "tipo") || "reparto",
      papel: str(f, "papel"),
      mensaje: str(f, "mensaje"),
      responder_antes: antes ? localMxToIso(`${antes}T23:59`) : null,
    },
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/elenco`);
  const aid = str(f, "aid");
  if (aid) revalidatePath(`/panel/audiciones/${aid}/resultados`);
  return { ok: true, message: "Oferta enviada. La persona la verá en Mi cuenta para aceptarla o declinarla." };
}

export async function withdrawOffer(_p: OfferState, f: FormData): Promise<OfferState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("casting_offer_withdraw", { oid: str(f, "id") });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${str(f, "production_id")}/elenco`);
  return { ok: true, message: "Oferta retirada." };
}
