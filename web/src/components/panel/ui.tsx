import Link from "next/link";

// Piezas visuales comunes del panel. Toman los tokens del Kit de Marca (globals.css):
// el panel conserva su acomodo oscuro; aquí solo cambia la piel.

export function PanelTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="titular text-3xl md:text-4xl">{title}</h1>
      {children && <div className="max-w-2xl text-texto-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`rounded-[22px] border border-linea bg-telon p-5 md:p-6 ${className}`}>{children}</div>;
}

const ESTADOS: Record<string, string> = {
  borrador: "border border-linea-2 bg-telon-2 text-texto-2",
  publicada: "border border-exito/40 bg-exito/15 text-exito",
  archivada: "border border-linea-2 bg-telon-2 text-texto-3",
  cancelada: "border border-carmin/50 bg-carmin/20 text-[#ffb3be]",
  oculta: "border border-linea bg-telon-2 text-texto-3",
};

export function EstadoChip({ estado }: { estado: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ${ESTADOS[estado] ?? ESTADOS.borrador}`}>
      {estado}
    </span>
  );
}

export function Soon({ etapa }: { etapa: string }) {
  return <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-texto-3">Etapa {etapa}</span>;
}

export function Notice({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${ok ? "border-exito/40 bg-exito/10 text-[#c6f6e0]" : "border-carmin/50 bg-carmin/15 text-[#ffd1d8]"}`}>
      {children}
    </p>
  );
}

export const input = "rounded-lg border border-linea-2 bg-telon-2 px-3 py-2.5 font-normal text-texto outline-none placeholder:text-[#8b8499] focus:border-lila";
export const button = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala hover:bg-white disabled:opacity-60";
export const buttonGhost = "rounded-full border border-linea-2 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-sm font-bold text-lila hover:text-[#c6b8ff]">← {children}</Link>;
}
