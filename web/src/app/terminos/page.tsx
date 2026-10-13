import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMINOS } from "@/content/legal";

export const metadata: Metadata = { title: TERMINOS.titulo, description: TERMINOS.resumen };

export default function Page() {
  return <LegalPage doc={TERMINOS} />;
}
