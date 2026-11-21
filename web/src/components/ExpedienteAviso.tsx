import Link from "next/link";
import { Icono } from "@/components/Icono";

// 0160: aviso fijo arriba de las notificaciones mientras al expediente personal le falte algo (equipo con créditos).
export function ExpedienteAviso({ faltan }: { faltan: string[] | null }) {
  if (!faltan?.length) return null;
  const lista = faltan.length > 4 ? `${faltan.slice(0, 4).join(", ")} y ${faltan.length - 4} más` : faltan.join(", ");
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-aviso/50 bg-aviso/10 px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <b className="text-aviso"><Icono nombre="alerta" /> Tu expediente está incompleto.</b>{" "}
        Como parte del equipo de DARF necesitamos todos tus datos (las medidas de vestuario son opcionales). Falta: {lista}.
      </p>
      <Link href="/cuenta/expediente" className="shrink-0 rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala">Completar mi expediente</Link>
    </div>
  );
}
