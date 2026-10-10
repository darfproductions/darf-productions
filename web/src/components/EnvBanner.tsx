import { isDev } from "@/lib/env";

// Franja fija en DEV para que nadie confunda el entorno de pruebas con la web real.
export function EnvBanner() {
  if (!isDev) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 bg-[#ffd400] px-3 py-1.5 text-center text-xs font-bold tracking-wide text-black"
    >
      ENTORNO DE PRUEBAS — DARF 2.0 DEV · datos ficticios · no es la web real
    </div>
  );
}
