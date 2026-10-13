"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Producción concluida: si se entra por dirección a una pestaña oculta, regresa al Resumen.
export function ConcludedGuard({ base, permitidas }: { base: string; permitidas: string[] }) {
  const path = usePathname();
  const router = useRouter();
  const seccion = path.startsWith(`${base}/`) ? path.slice(base.length + 1).split("/")[0] : "";
  const oculta = seccion !== "" && !permitidas.includes(seccion);
  useEffect(() => {
    if (oculta) router.replace(base);
  }, [oculta, base, router]);
  return null;
}
