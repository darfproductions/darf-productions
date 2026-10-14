import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { MiniAction } from "@/components/panel/MiniAction";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { asignarContacto, markContactRead, reabrirContacto, responderContacto } from "./actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Mensajes de contacto" };

type Msg = {
  id: string; nombre: string; correo: string; telefono: string | null; asunto: string | null; mensaje: string; leido: boolean; created_at: string;
  asignado_a: string | null; respondido_at: string | null; respondido_por: string | null; respuesta_canal: string | null; respuesta_nota: string | null;
};
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
const CANAL: Record<string, string> = { correo: "correo", whatsapp: "WhatsApp", telefono: "teléfono", otro: "otro medio" };
const VISTAS = [
  { id: "pendientes", label: "Sin responder" },
  { id: "mios", label: "Míos" },
  { id: "sin-asignar", label: "Sin asignar" },
  { id: "respondidos", label: "Respondidos" },
  { id: "todos", label: "Todos" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

/** Teléfono para WhatsApp: 10 dígitos de México → 52 + número. */
function whatsapp(tel: string | null, nombre: string): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  const n = d.length === 10 ? `52${d}` : d.length >= 12 ? d : "";
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(`¡Hola ${nombre.split(" ")[0]}! Te escribimos de DARF Productions por tu mensaje.`)}` : null;
}

// Mensajes del formulario de contacto (staff y Director; la base lo revisa). Bloque 4C (0096):
// asignar a alguien del equipo, marcar quién respondió y por dónde, y filtros.
export default async function Contacto({ searchParams }: PageProps<"/panel/contacto">) {
  const access = await requirePanel("/panel/contacto");
  if (!["staff", "admin"].includes(access.session.profile?.rol ?? "")) redirect("/panel");
  const sp = await searchParams;
  const vista: Vista = VISTAS.some((v) => v.id === sp.ver) ? (sp.ver as Vista) : "pendientes";
  const yo = access.session.userId;
  const supabase = await createClient();
  const [{ data }, { data: equipo }] = await Promise.all([
    supabase.from("contact_messages")
      .select("id, nombre, correo, telefono, asunto, mensaje, leido, created_at, asignado_a, respondido_at, respondido_por, respuesta_canal, respuesta_nota")
      .order("created_at", { ascending: false }).limit(500),
    supabase.rpc("contact_equipo"),
  ]);
  const todos = (data ?? []) as Msg[];
  const gente = (equipo ?? []) as { id: string; nombre: string }[];
  const nombre = new Map(gente.map((g) => [g.id, g.nombre]));
  const filtro: Record<Vista, (m: Msg) => boolean> = {
    pendientes: (m) => !m.respondido_at,
    mios: (m) => m.asignado_a === yo && !m.respondido_at,
    "sin-asignar": (m) => !m.asignado_a && !m.respondido_at,
    respondidos: (m) => !!m.respondido_at,
    todos: () => true,
  };
  const msgs = todos.filter(filtro[vista]);

  return (
    <>
      <PanelTitle eyebrow="Personas" title="Mensajes de contacto">Lo que llega desde la página de Contacto. Asígnalo a alguien y marca cuando ya se respondió.</PanelTitle>
      <nav aria-label="Ver mensajes" className="flex flex-wrap gap-2 text-sm">
        {VISTAS.map((v) => (
          <Link key={v.id} href={v.id === "pendientes" ? "/panel/contacto" : `/panel/contacto?ver=${v.id}`} aria-current={vista === v.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 font-semibold ${vista === v.id ? "border-texto" : "border-white/20"}`}>
            {v.label} <span className="text-texto-3">{todos.filter(filtro[v.id]).length}</span>
          </Link>
        ))}
      </nav>
      {msgs.length === 0 && <Card>{vista === "mios" ? "No tienes mensajes asignados sin responder." : "No hay mensajes aquí."}</Card>}
      {msgs.map((m) => {
        const wa = whatsapp(m.telefono, m.nombre);
        return (
          <Card key={m.id} className={`flex flex-col gap-3 ${m.respondido_at ? "opacity-80" : !m.leido ? "border border-[#a48bff]/40" : ""}`}>
            <div className="flex flex-col gap-1">
              <p className={m.leido ? "" : "font-bold"}>{m.asunto || "Sin asunto"} <span className="font-normal text-texto-3">· {fecha(m.created_at)}</span></p>
              <p className="text-sm text-texto-2">{m.nombre} · <a href={`mailto:${m.correo}`} className="text-violeta-claro">{m.correo}</a>{m.telefono ? ` · ${m.telefono}` : ""}</p>
              <p className="whitespace-pre-line text-sm">{m.mensaje}</p>
            </div>
            <p className="text-sm">
              {m.respondido_at
                ? <b className="text-[#bbf7d0]"><Icono nombre="check" /> Respondido por {nombre.get(m.respondido_por ?? "") ?? "alguien del equipo"} el {fecha(m.respondido_at)} · {CANAL[m.respuesta_canal ?? ""] ?? "otro medio"}{m.respuesta_nota ? `: ${m.respuesta_nota}` : ""}</b>
                : m.asignado_a ? <span className="text-texto-2">Asignado a <b className="text-texto">{m.asignado_a === yo ? "ti" : nombre.get(m.asignado_a) ?? "alguien"}</b></span>
                : <span className="text-aviso">Sin asignar</span>}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <a href={`mailto:${m.correo}?subject=${encodeURIComponent(`Re: ${m.asunto || "Tu mensaje a DARF Productions"}`)}`} className={chico}>Responder por correo</a>
              {wa && <a href={wa} target="_blank" rel="noopener" className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-[#062b16]">WhatsApp</a>}
              {!m.respondido_at && (
                <ActionForm inline action={asignarContacto} hidden={{ id: m.id }} submit="Asignar" submitClass={chico}>
                  <label className="sr-only" htmlFor={`asig-${m.id}`}>Asignar a</label>
                  <select id={`asig-${m.id}`} name="uid" defaultValue={m.asignado_a ?? ""} className={`${input} py-1.5 text-sm`}>
                    <option value="">Sin asignar</option>
                    {gente.map((g) => <option key={g.id} value={g.id}>{g.id === yo ? `${g.nombre} (yo)` : g.nombre}</option>)}
                  </select>
                </ActionForm>
              )}
              {!m.leido && !m.respondido_at && <ActionForm inline action={markContactRead} hidden={{ id: m.id }} submit="Marcar leído" submitClass={chico} />}
              {m.respondido_at && <MiniAction action={reabrirContacto} hidden={{ id: m.id }} confirm="¿Quitar “respondido” de este mensaje?" label="Reabrir" buttonClass={chico} />}
            </div>
            {!m.respondido_at && (
              <details>
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Marcar respondido</summary>
                <ActionForm action={responderContacto} hidden={{ id: m.id }} submit="Guardar respuesta" submitClass={`${chico} mt-2 self-start`}>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <label className="flex flex-col gap-1 text-sm font-semibold">¿Por dónde?
                      <select name="canal" defaultValue={wa ? "whatsapp" : "correo"} className={input}>
                        <option value="correo">Correo</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telefono">Teléfono</option>
                        <option value="otro">Otro</option>
                      </select>
                    </label>
                    <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm font-semibold">Nota (opcional)
                      <input name="nota" maxLength={500} placeholder="Ej. Le mandé las fechas de enero" className={input} />
                    </label>
                  </div>
                </ActionForm>
              </details>
            )}
          </Card>
        );
      })}
    </>
  );
}
