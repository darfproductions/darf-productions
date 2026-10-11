import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { DoorScanner } from "./DoorScanner";

export const metadata: Metadata = { title: "Puerta" };

// Validación de boletos en puerta, pensada para el celular.
export default async function DoorPage({ params }: PageProps<"/panel/producciones/[id]/puerta">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/puerta`);
  if (!can(access, id, "puerta.validar")) redirect(`/panel/producciones/${id}`);
  return (
    <Card>
      <p className="mb-4 text-sm text-texto-2">Apunta la cámara al QR del boleto. Cada boleto solo entra una vez; si alguien intenta usarlo de nuevo, aquí lo verás.</p>
      <DoorScanner />
    </Card>
  );
}
