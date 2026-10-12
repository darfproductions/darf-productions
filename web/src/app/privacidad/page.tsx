import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACIDAD } from "@/content/legal";

export const metadata: Metadata = { title: PRIVACIDAD.titulo, description: PRIVACIDAD.resumen };

export default function Page() {
  return <LegalPage doc={PRIVACIDAD} />;
}
