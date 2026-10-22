import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { avisoAnticipacion, fechaLegible } from "@/lib/showcase-rules";
import { actualizarSolicitud } from "../actions";

export const metadata: Metadata = { title: "Showcases · Solicitudes" };

const ESTADOS = { nueva: "Nuevas", cotizada: "Cotizadas", confirmada: "Confirmadas", descartada: "Descartadas" } as const;
type Estado = keyof typeof ESTADOS;
const COLOR: Record<Estado, string> = { nueva: "bg-[#ff2f8c]", cotizada: "bg-[#3b1ce8]", confirmada: "bg-[#16a34a]", descartada: "bg-white/20" };
type Fila = {
  id: string; plan_nombre: string; nombre: string; telefono: string; correo: string | null; fecha: string | null; horario: string | null; lugar: string | null;
  tipo_evento: string | null; personas: number | null; notas: string | null; estado: Estado; notas_internas: string | null; created_at: string;
};
const cuando = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
/** WhatsApp del cliente: 10 dígitos → con 52 de México. */
const waCliente = (tel: string, plan: string, nombre: string) => {
  const d = tel.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(`Hola ${nombre}, te escribimos de DARF Productions por tu solicitud del showcase ${plan}.`)}`;
};

// Bandeja de solicitudes "Contratar": cada envío del formulario queda aquí aunque el cliente no mande el WhatsApp.
export default async function SolicitudesShowcase({ searchParams }: PageProps<"/panel/showcases/solicitudes">) {
  const sp = await searchParams;
  const q = String(sp.ver ?? "");
  const ver: Estado | "todas" = q === "todas" || q in ESTADOS ? (q as Estado | "todas") : "nueva";
  const supabase = await createClient();
  const { data } = await supabase.from("showcase_solicitudes")
    .select("id, plan_nombre, nombre, telefono, correo, fecha, horario, lugar, tipo_evento, personas, notas, estado, notas_internas, created_at")
    .order("created_at", { ascending: false }).limit(500);
  const todas = (data ?? []) as Fila[];
  const lista = ver === "todas" ? todas : todas.filter((s) => s.estado === ver);
  const cuenta = (e: Estado) => todas.filter((s) => s.estado === e).length;
  return (
    <>
      <nav aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2 text-sm">
        {([...Object.keys(ESTADOS), "todas"] as (Estado | "todas")[]).map((e) => (
          <Link key={e} href={`/panel/showcases/solicitudes?ver=${e}`} aria-current={ver === e ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-semibold ${ver === e ? "bg-texto text-sala" : "border border-white/20 hover:border-white/50"}`}>
            {e === "todas" ? `Todas (${todas.length})` : `${ESTADOS[e]} (${cuenta(e)})`}
          </Link>
        ))}
      </nav>
      {lista.length === 0 && <Card><p className="text-sm text-texto-2">No hay solicitudes {ver === "todas" ? "todavía" : `en "${ESTADOS[ver]}"`}.</p></Card>}
      {lista.map((s) => {
        const aviso = s.estado === "nueva" ? avisoAnticipacion(s.fecha) : null;
        return (
          <Card key={s.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{s.nombre} · <span className="text-violeta-claro">{s.plan_nombre}</span></p>
                <p className="text-xs text-texto-3">Llegó el {cuando(s.created_at)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ${COLOR[s.estado]}`}>{s.estado}</span>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-texto-3">Teléfono: </dt><dd className="inline">{s.telefono}</dd></div>
              {s.correo && <div><dt className="inline text-texto-3">Correo: </dt><dd className="inline">{s.correo}</dd></div>}
              {s.fecha && <div><dt className="inline text-texto-3">Fecha: </dt><dd className="inline">{fechaLegible(s.fecha)}{s.horario ? ` · ${s.horario}` : ""}</dd></div>}
              {s.lugar && <div><dt className="inline text-texto-3">Lugar: </dt><dd className="inline">{s.lugar}</dd></div>}
              {s.tipo_evento && <div><dt className="inline text-texto-3">Tipo: </dt><dd className="inline">{s.tipo_evento}</dd></div>}
              {s.personas && <div><dt className="inline text-texto-3">Personas: </dt><dd className="inline">{s.personas}</dd></div>}
            </dl>
            {s.notas && <p className="whitespace-pre-line rounded-xl bg-telon-2 p-3 text-sm">{s.notas}</p>}
            {aviso && <p className="text-sm font-semibold text-aviso">{aviso}</p>}
            <a href={waCliente(s.telefono, s.plan_nombre, s.nombre)} target="_blank" rel="noopener" className="self-start rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#0b0910]">Escribirle por WhatsApp</a>
            <ActionForm action={actualizarSolicitud} hidden={{ id: s.id }} submit="Guardar">
              <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Estado
                  <select className={input} name="estado" defaultValue={s.estado}>
                    {(Object.keys(ESTADOS) as Estado[]).map((e) => <option key={e} value={e}>{ESTADOS[e].slice(0, -1)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Notas del equipo (no las ve el cliente)
                  <input className={input} name="notas_internas" defaultValue={s.notas_internas ?? ""} placeholder="Cotizado $4,500 con traslado…" />
                </label>
              </div>
            </ActionForm>
          </Card>
        );
      })}
    </>
  );
}
