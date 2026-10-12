import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { DoorScanner } from "./DoorScanner";
import { funcionDePuerta } from "./door-rules";

export const metadata: Metadata = { title: "Puerta" };

// Validación de boletos en puerta, pensada para el celular. Se valida contra UNA función:
// un boleto de otra fecha se rechaza sin gastarse (0068).
export default async function DoorPage({ params }: PageProps<"/panel/producciones/[id]/puerta">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/puerta`);
  if (!can(access, id, "puerta.validar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.from("performances").select("id, starts_at").eq("production_id", id).not("starts_at", "is", null).order("starts_at");
  const funciones = (data ?? []) as { id: string; starts_at: string }[];
  return (
    <Card>
      <p className="mb-4 text-sm text-texto-2">Elige la función que está entrando y apunta la cámara al QR del boleto. Cada boleto solo entra una vez y solo en su función.</p>
      {funciones.length ? <DoorScanner funciones={funciones} inicial={funcionDePuerta(funciones, new Date())} /> : <p className="text-sm">Esta obra no tiene funciones con fecha.</p>}
    </Card>
  );
}
