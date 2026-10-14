import { Icono } from "@/components/Icono";
import { ligaGoogle, ligaOutlook, type EventoCal } from "@/lib/calendario";

// "Agregar a mi calendario" (Diego 2026-10-14): un botón que se abre con las opciones de Google, Apple
// y Microsoft (Outlook personal o Microsoft 365), y el archivo .ics para cualquier otro calendario.
// Apple abre el .ics directo en Calendario (iPhone, iPad y Mac). Sin JavaScript (details/summary).
export function AgregarCalendario({ ics, evento, className = "" }: { ics: string; evento: EventoCal; className?: string }) {
  const opcion = "flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:border-white/50";
  const externa = { target: "_blank", rel: "noreferrer" } as const;
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 [&::-webkit-details-marker]:hidden">
        <Icono nombre="calendario" />
        Agregar a mi calendario
        <Icono nombre="chevron-abajo" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={ligaGoogle(evento)} {...externa} className={opcion}>Google Calendar <Icono nombre="externo" className="opacity-60" /></a>
        <a href={ics} className={opcion}>Apple Calendar</a>
        <a href={ligaOutlook(evento)} {...externa} className={opcion}>Outlook <Icono nombre="externo" className="opacity-60" /></a>
        <a href={ligaOutlook(evento, "trabajo")} {...externa} className={opcion}>Microsoft 365 (trabajo o escuela) <Icono nombre="externo" className="opacity-60" /></a>
        <a href={ics} download className={opcion}><Icono nombre="descargar" /> Otro calendario (.ics)</a>
      </div>
    </details>
  );
}
