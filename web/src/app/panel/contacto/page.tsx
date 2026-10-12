import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle } from "@/components/panel/ui";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { markContactRead } from "./actions";

export const metadata: Metadata = { title: "Mensajes de contacto" };

type Msg = { id: string; nombre: string; correo: string; telefono: string | null; asunto: string | null; mensaje: string; leido: boolean; created_at: string };
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Mensajes del formulario de contacto (staff y Director; la base lo revisa).
export default async function Contacto() {
  const access = await requirePanel("/panel/contacto");
  if (!["staff", "admin"].includes(access.session.profile?.rol ?? "")) redirect("/panel");
  const supabase = await createClient();
  const { data } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  const msgs = (data ?? []) as Msg[];
  return (
    <>
      <PanelTitle eyebrow="Personas" title="Mensajes de contacto">Lo que llega desde la página de Contacto.</PanelTitle>
      {msgs.length === 0 && <Card>No hay mensajes.</Card>}
      {msgs.map((m) => (
        <Card key={m.id} className={`flex flex-col gap-2 ${m.leido ? "opacity-75" : "border border-[#a78bfa]/40"}`}>
          <p className={m.leido ? "" : "font-bold"}>{m.asunto || "Sin asunto"} <span className="font-normal text-texto-3">· {fecha(m.created_at)}</span></p>
          <p className="text-sm text-texto-2">{m.nombre} · <a href={`mailto:${m.correo}`} className="text-violeta-claro">{m.correo}</a>{m.telefono ? ` · ${m.telefono}` : ""}</p>
          <p className="whitespace-pre-line text-sm">{m.mensaje}</p>
          {!m.leido && <ActionForm inline action={markContactRead} hidden={{ id: m.id }} submit="Marcar leído" submitClass="self-start rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />}
        </Card>
      ))}
    </>
  );
}
