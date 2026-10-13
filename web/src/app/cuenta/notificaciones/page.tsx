import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ActionForm } from "@/components/panel/ActionForm";
import { NotificationList } from "@/components/panel/NotificationList";
import { PushSettings } from "@/components/pwa/PushSettings";
import { requireSession } from "@/lib/auth";
import { deleteReadNotifications, markAllNotifications } from "@/lib/notification-actions";
import { listNotifications } from "@/lib/notifications";
import { canSeePanel } from "@/lib/permissions";
import { getPushInfo, PUSH_TIPOS, PUSH_TIPOS_CUENTA } from "@/lib/push";

export const metadata: Metadata = { title: "Mis notificaciones" };

const chip = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Mis notificaciones en Mi cuenta: para todos, tengan o no panel (respuestas a solicitudes,
// avisos del equipo…). Son las mismas que se ven en el panel.
export default async function MisNotificaciones({ searchParams }: PageProps<"/cuenta/notificaciones">) {
  const session = await requireSession("/cuenta/notificaciones");
  const sp = await searchParams;
  const soloNoLeidas = sp.ver === "nuevas";
  const [items, push, panel] = await Promise.all([listNotifications({ soloNoLeidas, limit: 100 }), getPushInfo(), canSeePanel(session)]);
  const sel = (on: boolean) => `rounded-full border px-3 py-1.5 font-semibold ${on ? "border-texto" : "border-white/20"}`;
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="Notificaciones">
        Lo nuevo que tiene que ver contigo: tus boletos, respuestas a tus solicitudes, avisos de tu equipo y más.
      </PageHeading>
      <div className="mx-auto flex max-w-[900px] flex-col gap-5 px-5 md:px-16">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href="/cuenta" className="font-bold text-violeta-claro">← Mi cuenta</Link>
          {panel && <Link href="/panel/notificaciones" className="font-bold text-violeta-claro">Ver en el panel →</Link>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/cuenta/notificaciones" className={sel(!soloNoLeidas)}>Todas</Link>
          <Link href="/cuenta/notificaciones?ver=nuevas" className={sel(soloNoLeidas)}>No leídas</Link>
          <span className="ml-auto flex flex-wrap gap-2">
            <ActionForm inline action={markAllNotifications} submit="Marcar todas leídas" submitClass={chip} />
            <ActionForm inline action={deleteReadNotifications} confirm="¿Borrar todas las notificaciones leídas?" submit="Borrar leídas" submitClass={chip} />
          </span>
        </div>
        <section aria-label="Notificaciones" className="rounded-2xl bg-telon p-5 md:p-6"><NotificationList items={items} /></section>
        <section aria-labelledby="telefono" className="flex scroll-mt-16 flex-col gap-3 rounded-2xl bg-telon p-5 md:p-6">
          <h2 id="telefono" className="titular text-2xl">En mi teléfono</h2>
          <PushSettings publicKey={push.publicKey} apagados={push.apagados} tipos={panel ? PUSH_TIPOS : PUSH_TIPOS_CUENTA} donde={panel ? "panel" : "cuenta"} />
        </section>
      </div>
    </main>
  );
}
