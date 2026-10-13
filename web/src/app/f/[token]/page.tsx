/* eslint-disable @next/next/no-img-element -- logo SVG del kit */
import type { Metadata } from "next";
import { NoValida, Verificada } from "@/components/credencial/Verificada";
import { getCredencialPublica } from "@/lib/fanzone";

export const metadata: Metadata = { title: "Credencial Club Fan", robots: { index: false, follow: false } };

// Credencial del Club Fan escaneada con un celular (0080): confirma que es socio. Sin contacto.
// Las ligas /f/ viejas siguen sirviendo; las nuevas credenciales usan /g/ (0083).
export default async function CredencialPublicaPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const c = await getCredencialPublica(token);
  return (
    <main className="flex flex-col items-center gap-6 px-5 pb-24 pt-12 text-center">
      <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-10 w-auto" />
      {c ? <Verificada nombre={c.nombre} socio={c} /> : <NoValida />}
    </main>
  );
}
