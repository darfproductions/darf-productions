import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Panel" };

// El panel nuevo se construye en la Fase 3 (diseño ya aprobado en el lienzo).
// Mientras tanto, la gestión de boletería sigue en el panel de la 1.0 sobre DEV.
export default async function PanelPage() {
  const session = await requireSession("/panel");
  const rol = session.profile?.rol;
  if (rol !== "staff" && rol !== "admin") redirect("/cuenta");

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Panel" title="Panel de administración">
        El panel nuevo (producciones, contenido, funciones, boletería, usuarios y permisos) se
        construye en la Fase 3.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 md:px-16">
        <div className="max-w-2xl rounded-2xl bg-telon p-6">
          <p className="text-lg font-semibold">Mientras tanto</p>
          <p className="mt-2 text-texto-2">
            Aprobar solicitudes, ver el mapa de asientos, vender en taquilla y validar QR se hace en
            el panel de la versión actual, conectado a la misma base de pruebas.
          </p>
          <a href="https://darf-2-dev-darf-productions.vercel.app/?v=staff" className="mt-4 inline-block font-bold text-violeta-claro">
            Abrir el panel actual (DEV) →
          </a>
        </div>
      </div>
    </main>
  );
}
