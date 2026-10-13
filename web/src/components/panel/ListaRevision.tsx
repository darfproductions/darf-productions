import Link from "next/link";
import { Card } from "@/components/panel/ui";

export type PuntoRevision = { clave: string; texto: string; ok: boolean; detalle?: string; href: string; /** "obligatorio" (✗ en ámbar), "opcional" (○) o "aviso" (! en ámbar, no impide). */ nivel: "obligatorio" | "opcional" | "aviso" };

// Lista de revisión con liga a donde se arregla cada punto (Bloque 4C: "Listo para vender" y
// "Antes de cerrar la temporada"). Plegada cuando todo está bien.
export function ListaRevision({ titulo, resumen, listo, puntos, className = "" }: { titulo: string; resumen: string; listo: boolean; puntos: PuntoRevision[]; className?: string }) {
  return (
    <Card className={`${className} ${listo ? "" : "border border-aviso/40"}`}>
      <details open={!listo} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <span>
            <span className="block text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{titulo}</span>
            <span className={`mt-1 block font-bold ${listo ? "text-[#bbf7d0]" : "text-aviso"}`}>{resumen}</span>
          </span>
          <span className="text-sm font-bold text-violeta-claro group-open:hidden">Ver lista</span>
        </summary>
        <ul className="mt-3 grid gap-1.5">
          {puntos.map((x) => (
            <li key={x.clave}>
              <Link href={x.href} className="flex items-start gap-3 rounded-lg bg-sala px-4 py-2.5 hover:bg-telon-2">
                <span aria-hidden="true" className={`w-3 font-black ${x.ok ? "text-[#bbf7d0]" : x.nivel === "opcional" ? "text-texto-3" : "text-aviso"}`}>
                  {x.ok ? "✓" : x.nivel === "obligatorio" ? "✗" : x.nivel === "aviso" ? "!" : "○"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={x.ok ? "text-texto-2" : "font-semibold"}>{x.texto}</span>
                  {x.nivel === "opcional" && <span className="text-xs text-texto-3"> (opcional)</span>}
                  <span className="sr-only">{x.ok ? ": listo" : ": pendiente"}</span>
                  {x.detalle && !x.ok && <span className="block text-sm text-texto-3">{x.detalle}</span>}
                </span>
                {!x.ok && <span className="text-violeta-claro">→</span>}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
