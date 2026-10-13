// Reglas de ofertas de papel que se muestran en pantalla (puras, con pruebas).

export const TIPO_CREDITO: Record<string, string> = {
  reparto: "Reparto",
  ensamble: "Ensamble",
  creativo: "Equipo creativo",
  produccion: "Equipo de producción",
  crew: "Crew",
  tecnico: "Equipo técnico",
};

export const ESTADO_OFERTA: Record<string, { label: string; cls: string }> = {
  enviada: { label: "Esperando respuesta", cls: "bg-[#5a4313] text-[#fde68a]" },
  aceptada: { label: "Aceptada", cls: "bg-[#14532d] text-[#bbf7d0]" },
  declinada: { label: "Declinada", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  retirada: { label: "Retirada", cls: "bg-[#2b2f3a] text-texto-3" },
};

/** "Reparto · Jenny Lind" / "Ensamble". */
export function offerLabel(o: { tipo: string; papel: string | null }): string {
  return [TIPO_CREDITO[o.tipo] ?? o.tipo, o.papel].filter(Boolean).join(" · ");
}
