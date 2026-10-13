import { ligaGoogle, type EventoCal } from "@/lib/calendario";

// Dos ligas: el archivo .ics (iPhone, Outlook, cualquier calendario) y Google Calendar.
export function AgregarCalendario({ ics, evento, className = "" }: { ics: string; evento: EventoCal; className?: string }) {
  const liga = "font-bold text-violeta-claro underline underline-offset-4";
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}>
      <span aria-hidden="true">📅</span>
      <a href={ics} className={liga}>Agregar a mi calendario</a>
      <a href={ligaGoogle(evento)} target="_blank" rel="noreferrer" className={liga}>Google Calendar</a>
    </p>
  );
}
