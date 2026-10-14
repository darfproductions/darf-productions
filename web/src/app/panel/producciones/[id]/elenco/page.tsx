/* eslint-disable @next/next/no-img-element -- retratos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, buttonGhost, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/panel/ActionForm";
import { ESTADO_OFERTA, listOffers, offerLabel } from "@/lib/casting";
import { AddCreditForm } from "./AddCreditForm";
import { Personajes } from "./Personajes";
import { OfferForm } from "./OfferForm";
import { withdrawOffer } from "./offer-actions";
import { moveCredit, removeCredit, setCreditPhoto, updatePapel } from "./actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Elenco y equipos" };

const GRUPOS = [
  { tipo: "reparto", titulo: "Reparto", papel: "Personaje" },
  { tipo: "ensamble", titulo: "Ensamble", papel: null },
  { tipo: "creativo", titulo: "Equipo creativo", papel: "Puesto" },
  { tipo: "produccion", titulo: "Equipo de producción", papel: "Puesto" },
  { tipo: "crew", titulo: "Crew", papel: "Puesto" },
  { tipo: "tecnico", titulo: "Equipo técnico", papel: "Puesto" },
] as const;

type Row = { id: string; tipo: string; papel: string | null; foto_path: string | null; orden: number; activo: boolean; people: { id: string; nombre: string; profile_id: string | null } | null };

const mini = "grid h-8 w-8 place-items-center rounded-full border border-white/20 text-sm hover:border-white/50 disabled:opacity-40";

// Elenco y equipos de la obra: tipos fijos de la plantilla y foto POR OBRA.
export default async function CastEditor({ params }: PageProps<"/panel/producciones/[id]/elenco">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/elenco`);
  if (!can(access, id, "elenco.gestionar") && !can(access, id, "obra.editar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ data: credits }, { data: people }] = await Promise.all([
    supabase.from("production_credits").select("id, tipo, papel, foto_path, orden, people(id, nombre, profile_id), activo").eq("production_id", id).order("orden").order("id"),
    supabase.from("people").select("nombre").order("nombre").limit(2000),
  ]);
  const rows = (credits ?? []) as unknown as Row[];
  const armaElenco = can(access, id, "elenco.gestionar");
  // La ficha de talento solo la abre quien arma el elenco o el Director (can_view_talent).
  const verFicha = armaElenco || access.isDirector;
  const ofertas = armaElenco ? await listOffers(id) : [];
  const listId = "personas-darf";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        Las fotos son de esta obra: súbelas de la sesión de esta producción (vertical 3:4) para que todas se vean iguales.
        Una persona puede estar en varios grupos.
      </p>
      <Personajes pid={id} />
      {armaElenco && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Ofertas</h2>
          <p className="text-sm text-texto-2">Manda una oferta a alguien con cuenta DARF. Cuando la acepta en Mi cuenta, aparece solo en el elenco (abajo) y entra al portal del elenco. Desde los Resultados de una audición también puedes mandarlas.</p>
          {ofertas.length > 0 && (
            <ul className="flex flex-col gap-2">
              {ofertas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                  <span><b>{o.nombre}</b> <span className="text-texto-3">· {o.email}</span><br />{offerLabel(o)}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_OFERTA[o.estado]?.cls}`}>{ESTADO_OFERTA[o.estado]?.label}</span>
                    {o.estado === "enviada" && <ActionForm inline action={withdrawOffer} hidden={{ id: o.id, production_id: id }} confirm={`¿Retirar la oferta a ${o.nombre}?`} submit="Retirar" submitClass="rounded-full border border-white/25 px-3 py-1 text-xs font-bold" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-bold">+ Ofrecer por correo (equipo técnico, creativo o elenco sin audición)</summary>
            <div className="mt-3"><OfferForm hidden={{ production_id: id }} porCorreo /></div>
          </details>
        </Card>
      )}
      <datalist id={listId}>{(people ?? []).map((p) => <option key={p.nombre as string} value={p.nombre as string} />)}</datalist>
      {GRUPOS.map((g) => {
        const items = rows.filter((r) => r.tipo === g.tipo);
        return (
          <Card key={g.tipo}>
            <section className="flex flex-col gap-3">
              <h2 className="titular text-xl">{g.titulo} <span className="text-base font-normal text-texto-3">· {items.length}</span></h2>
              <ul className="flex flex-col divide-y divide-white/10">
                {items.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-telon-2">
                      {r.foto_path && <img src={assetUrl(r.foto_path)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-40 flex-1">
                      <p className="font-semibold">
                        {r.people ? (verFicha ? <Link href={r.people.profile_id ? `/panel/talento/${r.people.profile_id}` : `/panel/talento/p/${r.people.id}`} className="hover:underline">{r.people.nombre}</Link> : r.people.nombre) : "—"}
                        {r.people && !r.people.profile_id && <span className="ml-2 text-[10px] font-normal text-texto-3">sin cuenta</span>}
                        {!r.activo && <span className="ml-2 rounded-full bg-[#5a1a22] px-2 py-0.5 text-[10px] font-bold text-[#fecdd3]">Baja</span>}
                      </p>
                      {g.papel && (
                        <div className="mt-1 max-w-sm">
                          <ActionForm inline action={updatePapel} hidden={{ pid: id, id: r.id }} submit="Guardar" submitClass={`${buttonGhost} py-1 text-xs`}>
                            <input className={`${input} min-w-0 flex-1 py-1.5 text-sm`} name="papel" defaultValue={r.papel ?? ""} aria-label={g.papel} />
                          </ActionForm>
                        </div>
                      )}
                    </div>
                    <ImageUpload compact productionId={id} kind="retrato" carpeta="creditos" base={r.people?.nombre ?? "retrato"} save={setCreditPhoto.bind(null, id, r.id)} label={r.foto_path ? "Cambiar foto" : "Subir foto"} />
                    <div className="flex items-center gap-1">
                      {i > 0 && <ActionForm inline action={moveCredit} hidden={{ pid: id, id: r.id, dir: "up" }} submit={<Icono nombre="flecha-arriba" etiqueta="Subir" />} submitClass={mini} />}
                      {i < items.length - 1 && <ActionForm inline action={moveCredit} hidden={{ pid: id, id: r.id, dir: "down" }} submit={<Icono nombre="flecha-abajo" etiqueta="Bajar" />} submitClass={mini} />}
                      <ActionForm inline action={removeCredit} hidden={{ pid: id, id: r.id }} confirm={`¿Quitar a ${r.people?.nombre} de ${g.titulo.toLowerCase()}? Solo deja de salir en la página; si es integrante, su baja se hace en Expedientes.`} submit={<Icono nombre="x" etiqueta="Quitar" />} submitClass={mini} />
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="py-2 text-sm text-texto-3">Nadie todavía.</li>}
              </ul>
              <AddCreditForm pid={id} tipo={g.tipo} papelLabel={g.papel} listId={listId} />
            </section>
          </Card>
        );
      })}
    </div>
  );
}
