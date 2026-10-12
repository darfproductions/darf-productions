import { ETIQUETA_ESTADO, type EstadoPublico } from "@/lib/home-rules";

const CLASE: Record<EstadoPublico, string> = { cartelera: "estado-vivo", proximamente: "estado-pronto", archivo: "estado-archivo" };

// Estado de la obra (guía): En cartelera en pulso, Próximamente en oro claro, Archivo en gris.
export function EstadoObra({ estado, texto, className = "" }: { estado: EstadoPublico; texto?: string; className?: string }) {
  return <span className={`estado ${CLASE[estado]} ${className}`}>{texto ?? ETIQUETA_ESTADO[estado]}</span>;
}
