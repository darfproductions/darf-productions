import Link from "next/link";

// Piezas visuales comunes del panel (dirección A2, pensado primero para celular).

export function PanelTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.24em] text-texto-3">{eyebrow}</p>}
      <h1 className="titular text-3xl md:text-4xl">{title}</h1>
      {children && <div className="max-w-2xl text-texto-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-telon p-5 md:p-6 ${className}`}>{children}</div>;
}

const ESTADOS: Record<string, string> = {
  borrador: "bg-[#3a3346] text-texto-2",
  publicada: "bg-[#14532d] text-[#bbf7d0]",
  archivada: "bg-[#2b2f3a] text-texto-2",
  cancelada: "bg-[#5a1a22] text-[#fecdd3]",
  oculta: "bg-[#3a3346] text-texto-3",
};

export function EstadoChip({ estado }: { estado: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${ESTADOS[estado] ?? ESTADOS.borrador}`}>
      {estado}
    </span>
  );
}

export function Soon({ etapa }: { etapa: string }) {
  return <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-texto-3">Etapa {etapa}</span>;
}

export function Notice({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm font-semibold ${ok ? "bg-[#14532d] text-[#dcfce7]" : "bg-[#5a1a22] text-[#ffe4e6]"}`}>
      {children}
    </p>
  );
}

export const input = "rounded-lg border border-white/10 bg-sala px-3 py-2.5 font-normal text-texto outline-none focus:border-violeta-claro";
export const button = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60";
export const buttonGhost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-sm font-bold text-violeta-claro">← {children}</Link>;
}
