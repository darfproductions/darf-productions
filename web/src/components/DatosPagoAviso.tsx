import Link from "next/link";
import { Icono } from "@/components/Icono";

// 0161: aviso fijo arriba de las notificaciones mientras falte la CLABE para los honorarios.
export function DatosPagoAviso({ falta }: { falta: boolean }) {
  if (!falta) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-aviso/50 bg-aviso/10 px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <b className="text-aviso"><Icono nombre="alerta" /> Faltan tus datos para pagarte.</b>{" "}
        Pon tu CLABE y si prefieres transferencia o efectivo, para que te lleguen tus honorarios.
      </p>
      <Link href="/cuenta/honorarios" className="shrink-0 rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala">Poner mis datos</Link>
    </div>
  );
}
