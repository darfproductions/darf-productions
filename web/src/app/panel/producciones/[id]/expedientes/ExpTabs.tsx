import Link from "next/link";

// Pestañas de Expedientes: la lista del elenco y, para quien maneja pagos, las cuotas (0112) y los adeudos (0079).
export function ExpTabs({ pid, actual, pagos, cobra = true }: { pid: string; actual: "integrantes" | "cuotas" | "adeudos"; pagos: boolean; cobra?: boolean }) {
  if (!pagos) return null;
  const tabs = [["integrantes", "Integrantes", ""], ["cuotas", "Cuotas y recaudación", "/cuotas"], ...(cobra ? [["adeudos", "Adeudos", "/adeudos"]] : [])] as const;
  return (
    <nav aria-label="Expedientes" className="flex gap-1 overflow-x-auto border-b border-white/10">
      {tabs.map(([k, label, path]) => (
        <Link key={k} href={`/panel/producciones/${pid}/expedientes${path}`} aria-current={actual === k ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold ${actual === k ? "border-texto text-texto" : "border-transparent text-texto-3 hover:text-texto"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
