import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { deleteNotification, markNotification } from "@/lib/notification-actions";
import type { Notificacion } from "@/lib/notifications";

const ICONO: Record<string, string> = { contacto: "✉", audicion: "🎭", orden: "🎟", oferta: "📜", documento: "📄", ausencia: "🕒", solicitud: "📝", equipo: "👥", cambio: "⚙" };
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
const mini = "text-xs font-bold text-texto-3 hover:text-texto";

// Lista tipo correo: las no leídas en negritas con un punto; las leídas en gris.
export function NotificationList({ items }: { items: Notificacion[] }) {
  if (!items.length) return <p className="px-1 text-sm text-texto-2">No tienes notificaciones.</p>;
  return (
    <ul className="flex flex-col divide-y divide-white/10">
      {items.map((n) => {
        const nueva = !n.read_at;
        return (
          <li key={n.id} className="flex items-start gap-3 py-3">
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${nueva ? "bg-[#a78bfa]" : "bg-transparent"}`} />
            <span aria-hidden="true" className="w-5 shrink-0 text-center">{ICONO[n.tipo] ?? "•"}</span>
            <div className="min-w-0 flex-1">
              {n.href ? (
                <Link href={n.href} className={`block wrap-anywhere hover:text-violeta-claro ${nueva ? "font-bold text-texto" : "text-texto-3"}`}>{n.titulo}</Link>
              ) : <p className={`wrap-anywhere ${nueva ? "font-bold" : "text-texto-3"}`}>{n.titulo}</p>}
              {n.detalle && <p className={`truncate text-sm ${nueva ? "text-texto-2" : "text-texto-3"}`}>{n.detalle}</p>}
              <p className="text-xs text-texto-3">{fecha(n.created_at)}{nueva ? "" : " · leída"}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ActionForm inline action={markNotification} hidden={{ id: String(n.id), leer: nueva ? "1" : "0" }} submit={nueva ? "Marcar leída" : "Marcar no leída"} submitClass={mini} />
              <ActionForm inline action={deleteNotification} hidden={{ id: String(n.id) }} submit="Borrar" submitClass={mini} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
