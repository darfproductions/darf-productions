import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { REEMBOLSOS } from "@/content/legal";

export const metadata: Metadata = { title: REEMBOLSOS.titulo, description: REEMBOLSOS.resumen };

export default function Page() {
  return <LegalPage doc={REEMBOLSOS} />;
}
