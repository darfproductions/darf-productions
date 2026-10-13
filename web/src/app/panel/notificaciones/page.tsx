import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { NotificationList } from "@/components/panel/NotificationList";
import { PushSettings } from "@/components/pwa/PushSettings";
import { Card, PanelTitle } from "@/components/panel/ui";
import { deleteReadNotifications, markAllNotifications } from "@/lib/notification-actions";
import { listNotifications } from "@/lib/notifications";
import { requirePanel } from "@/lib/permissions";
import { getPushInfo, PUSH_TIPOS } from "@/lib/push";

export const metadata: Metadata = { title: "Notificaciones" };

const chip = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Todas mis notificaciones: lo nuevo que tiene que ver conmigo según mis permisos.
export default async function Notificaciones({ searchParams }: PageProps<"/panel/notificaciones">) {
  await requirePanel("/panel/notificaciones");
  const sp = await searchParams;
  const soloNoLeidas = sp.ver === "nuevas";
  const [items, push] = await Promise.all([listNotifications({ soloNoLeidas }), getPushInfo()]);
  return (
    <>
      <PanelTitle eyebrow="Inicio" title="Notificaciones">
        Lo nuevo que tiene que ver contigo: solicitudes, órdenes, mensajes, cambios y lo del equipo. Nunca lo que tú mismo hiciste.
      </PanelTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/panel/notificaciones" className={`rounded-full border px-3 py-1.5 font-semibold ${!soloNoLeidas ? "border-texto" : "border-white/20"}`}>Todas</Link>
        <Link href="/panel/notificaciones?ver=nuevas" className={`rounded-full border px-3 py-1.5 font-semibold ${soloNoLeidas ? "border-texto" : "border-white/20"}`}>No leídas</Link>
        <span className="ml-auto flex gap-2">
          <ActionForm inline action={markAllNotifications} submit="Marcar todas leídas" submitClass={chip} />
          <ActionForm inline action={deleteReadNotifications} confirm="¿Borrar todas las notificaciones leídas?" submit="Borrar leídas" submitClass={chip} />
        </span>
      </div>
      <Card><NotificationList items={items} /></Card>
      <Card className="flex flex-col gap-3">
        <h2 id="telefono" className="titular text-xl">En mi teléfono</h2>
        <PushSettings publicKey={push.publicKey} apagados={push.apagados} tipos={PUSH_TIPOS} />
      </Card>
    </>
  );
}
