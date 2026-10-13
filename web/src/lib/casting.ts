import { createClient } from "@/lib/supabase/server";

// Ofertas de papel (0040, etapa 3E). La base decide quién manda, ve y responde.

export { ESTADO_OFERTA, TIPO_CREDITO, offerLabel } from "@/lib/casting-rules";

export type MyOffer = {
  id: string; production_id: string; obra: string; tipo: string; papel: string | null; mensaje: string | null;
  responder_antes: string | null; estado: string; created_at: string;
};

export async function listMyOffers(): Promise<MyOffer[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_casting_offers");
  return (data ?? []) as MyOffer[];
}

export type TeamOffer = {
  id: string; user_id: string; nombre: string; email: string; application_id: string | null; tipo: string; papel: string | null;
  estado: string; responder_antes: string | null; created_at: string; respondida_at: string | null;
};

/** Ofertas de la obra con nombre y correo (solo quien arma el elenco). */
export async function listOffers(pid: string): Promise<TeamOffer[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("casting_offer_list", { pid });
  return (data ?? []) as TeamOffer[];
}
