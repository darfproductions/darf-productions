import Link from "next/link";
import { Card, PanelTitle } from "@/components/panel/ui";

// Dentro del panel: no existe o no tienes acceso (la base no deja ver lo que no te toca).
export default function PanelNotFound() {
  return (
    <>
      <PanelTitle eyebrow="Panel" title="No tienes acceso a esto">
        La página no existe o tu rol no incluye esta sección. Si crees que deberías verla, pídele a la Dirección de la obra o al Director que te dé el permiso.
      </PanelTitle>
      <Card className="flex flex-wrap gap-3">
        <Link href="/panel" className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">Volver al inicio del panel</Link>
        <Link href="/panel/producciones" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold">Mis producciones</Link>
      </Card>
    </>
  );
}
