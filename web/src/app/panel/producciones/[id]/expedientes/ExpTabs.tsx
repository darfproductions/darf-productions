import Link from "next/link";

// Pestañas de Expedientes: la lista del elenco y, para quien maneja pagos, los adeudos (0079).
export function ExpTabs({ pid, actual, pagos }: { pid: string; actual: "integrantes" | "adeudos"; pagos: boolean }) {
  if (!pagos) return null;
  const tabs = [["integrantes", "Integrantes", ""], ["adeudos", "Adeudos", "/adeudos"]] as const;
  return (
    <nav aria-label="Expedientes" className="flex gap-1 border-b border-white/10">
      {tabs.map(([k, label, path]) => (
        <Link key={k} href={`/panel/producciones/${pid}/expedientes${path}`} aria-current={actual === k ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold ${actual === k ? "border-texto text-texto" : "border-transparent text-texto-3 hover:text-texto"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
