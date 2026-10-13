"use client";

import { usePathname } from "next/navigation";

// Barra "Jóvenes para jóvenes" (guía de UI): el lema visible arriba en todo el sitio.
// En el panel no aparece, para dejarle el espacio al trabajo.
export function JpjBar() {
  const path = usePathname();
  if (path.startsWith("/panel")) return null;
  return (
    <div className="luz-darf relative z-30 flex min-h-9 items-center justify-center gap-3 px-4 py-1.5 text-center text-[10.5px] font-extrabold uppercase tracking-[0.32em] text-white print:hidden md:text-[11px]">
      Jóvenes para jóvenes
      <span className="hidden font-semibold normal-case tracking-[0.12em] text-white/75 sm:inline">· Teatro musical hecho por jóvenes en Querétaro</span>
    </div>
  );
}
