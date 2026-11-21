import { CopiarTexto } from "@/components/CopiarTexto";
import { formatearClabe } from "@/lib/clabe-rules";
import type { DatoPago } from "@/lib/honorarios";

// 0161: junto al pago de cada persona, cómo quiere cobrar (para depositar sin preguntar).
export function DatoPagoPersona({ d }: { d: DatoPago | undefined }) {
  if (!d) return <span className="mt-1 block text-[11px] font-normal text-aviso">Sin datos de pago (los pone en Mi cuenta, Mis honorarios)</span>;
  if (d.metodo === "efectivo") return <span className="mt-1 block text-[11px] font-bold text-texto-2">Prefiere efectivo</span>;
  return (
    <span className="mt-1 flex flex-col gap-1 text-[11px] font-normal text-texto-2">
      <span><b className="text-texto">Transferencia</b>{d.banco ? ` · ${d.banco}` : ""}{d.titular ? ` · ${d.titular}` : ""}</span>
      {d.clabe && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="select-all font-mono text-xs text-texto">{formatearClabe(d.clabe)}</span>
          <CopiarTexto texto={d.clabe} etiqueta="Copiar CLABE" />
        </span>
      )}
    </span>
  );
}
