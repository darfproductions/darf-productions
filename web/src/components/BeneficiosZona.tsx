import { Icono } from "@/components/Icono";
import { MOMENTOS_ENTREGA, TIPOS_BENEFICIO, notaBeneficio, textoBeneficio, textoCupo, type BeneficioCorto } from "@/lib/beneficios-rules";

/** Lo que incluye una zona (0122): ícono por tipo, cupo y funciones en las que aplica. Sirve en página, compra y boleto. */
export function BeneficiosZona({ beneficios, fechas, className = "" }: {
  beneficios: BeneficioCorto[] | undefined;
  /** id de función → "Sábado 5 de diciembre" (para "Solo en …"). */
  fechas?: Map<string, string>;
  className?: string;
}) {
  if (!beneficios?.length) return null;
  return (
    <ul className={`flex flex-col gap-1 text-[13px] ${className}`} aria-label="Incluye">
      {beneficios.map((b, i) => {
        const solo = b.funciones?.length && fechas ? b.funciones.map((f) => fechas.get(f)).filter(Boolean).join(", ") : "";
        // 0125: cuándo se entrega (el acceso ya dice cuántos minutos antes).
        const cuando = b.entrega && b.tipo !== "acceso" ? `Se entrega ${MOMENTOS_ENTREGA[b.entrega].corto}` : null;
        const extra = [cuando, textoCupo(b.cupo), solo ? `Solo ${solo}` : null].filter(Boolean).join(" · ");
        return (
          <li key={`${b.nombre}-${i}`} className="flex items-start gap-2">
            <Icono nombre={TIPOS_BENEFICIO[b.tipo]?.icono ?? "destello"} className="mt-0.5 shrink-0 opacity-80" />
            <span>
              <span className="font-semibold">{textoBeneficio(b)}</span>
              {notaBeneficio(b) && <span className="opacity-75"> — {notaBeneficio(b)}</span>}
              {extra && <span className="block text-[11.5px] font-bold uppercase tracking-[0.08em] opacity-70">{extra}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
