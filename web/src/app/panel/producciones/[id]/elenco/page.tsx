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
import { AddCreditForm, ChecksPersonajes, type OpcionPersonaje } from "./AddCreditForm";
import { Personajes } from "./Personajes";
import { OfferForm } from "./OfferForm";
import { withdrawOffer } from "./offer-actions";
import { moveCredit, programarCredito, publishAllCast, removeCredit, setCreditCharacters, setCreditPhoto, setCreditPublicado, setSoloCredito, updatePapel } from "./actions";
import { isoToLocalMx } from "@/lib/dates";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Elenco y equipos" };

const GRUPOS = [
  { tipo: "reparto", titulo: "Reparto", papel: "Personaje" },
  { tipo: "ensamble", titulo: "Ensamble", papel: null },
  { tipo: "creativo", titulo: "Equipo creativo", papel: "Puesto" },
  { tipo: "produccion", titulo: "Equipo de producción", papel: "Puesto" },
  // 0106: Staff del equipo de producción, lista de nombres sin puesto (como Ensamble).
  { tipo: "staff", titulo: "Equipo de producción · Staff", papel: null },
  { tipo: "crew", titulo: "Crew", papel: "Puesto" },
  { tipo: "tecnico", titulo: "Equipo técnico", papel: "Puesto" },
] as const;

const ELENCO = new Set(["reparto", "ensamble"]);

const saleEl = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

type Row = { id: string; tipo: string; papel: string | null; foto_path: string | null; orden: number; activo: boolean; publicado: boolean; solo_credito: boolean; publicar_at: string | null; people: { id: string; nombre: string; profile_id: string | null } | null; credit_characters?: { character_id: string }[] };

const mini = "grid h-8 w-8 place-items-center rounded-full border border-white/20 text-sm hover:border-white/50 disabled:opacity-40";

// Elenco y equipos de la obra: tipos fijos de la plantilla y foto POR OBRA.
export default async function CastEditor({ params }: PageProps<"/panel/producciones/[id]/elenco">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/elenco`);
  if (!can(access, id, "elenco.gestionar") && !can(access, id, "obra.editar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ data: credits }, { data: people }, { data: chars }] = await Promise.all([
    supabase.from("production_credits").select("id, tipo, papel, foto_path, orden, people(id, nombre, profile_id), activo, publicado, solo_credito, publicar_at, credit_characters(character_id)").eq("production_id", id).order("orden").order("id"),
    supabase.from("people").select("nombre").order("nombre").limit(2000),
    supabase.from("production_characters").select("id, nombre").eq("production_id", id).order("orden").order("created_at"),
  ]);
  const rows = (credits ?? []) as unknown as Row[];
  // 0112: personajes de la lista y quién ya tiene cada uno.
  const ocupado = new Map<string, string>();
  for (const r of rows) for (const c of r.credit_characters ?? []) if (r.activo) ocupado.set(c.character_id, [ocupado.get(c.character_id), r.people?.nombre].filter(Boolean).join(", "));
  const personajes: OpcionPersonaje[] = ((chars ?? []) as { id: string; nombre: string }[]).map((c) => ({ ...c, ocupado: ocupado.get(c.id) ?? null }));
  const armaElenco = can(access, id, "elenco.gestionar");
  // La ficha de talento solo la abre quien arma el elenco o el Director (can_view_talent).
  const verFicha = armaElenco || access.isDirector;
  const ofertas = armaElenco ? await listOffers(id) : [];
  const listId = "personas-darf";
  // 0107: Reparto y Ensamble entran sin publicar; se publican uno por uno o todos juntos.
  const porPublicar = rows.filter((r) => ELENCO.has(r.tipo) && !r.publicado).length;

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
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-texto-2">
          <b className="text-texto">Reparto y Ensamble</b> entran como <b className="text-texto">No publicado</b>: quedan guardados y ya tienen acceso como integrantes (ensayos, expediente, gafete), pero no salen en la página ni en el programa hasta que los publiques. Los demás equipos salen en cuanto los agregas.
        </p>
        {porPublicar > 0
          ? <ActionForm inline action={publishAllCast} hidden={{ pid: id }} confirm={`¿Publicar a ${porPublicar === 1 ? "1 persona" : `${porPublicar} personas`} del elenco? Saldrán en la página de la obra.`} submit={`Publicar todo el elenco (${porPublicar})`} submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">
              <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" name="avisar" /> Avisar al Club Fan</label>
            </ActionForm>
          : <span className="text-sm text-texto-3">Todo el elenco está publicado.</span>}
      </Card>
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
                        {r.solo_credito && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-texto-2">Solo crédito · no entra a ensayos</span>}
                        {ELENCO.has(r.tipo) && !r.publicado && <span className="ml-2 rounded-full bg-[#4a3b10] px-2 py-0.5 text-[10px] font-bold text-[#fde68a]">{r.publicar_at ? `Sale el ${saleEl(r.publicar_at)}` : "No publicado"}</span>}
                        {!r.activo && <span className="ml-2 rounded-full bg-[#5a1a22] px-2 py-0.5 text-[10px] font-bold text-[#fecdd3]">Baja</span>}
                      </p>
                      {g.tipo === "reparto" && personajes.length > 0 ? (
                        <details className="mt-1 max-w-xl">
                          <summary className="cursor-pointer text-sm text-texto-2">{r.papel || "Sin personaje"} <span className="text-xs font-bold text-violeta-claro">· cambiar</span></summary>
                          <div className="mt-2 rounded-lg bg-sala p-3">
                            <ActionForm action={setCreditCharacters} hidden={{ pid: id, id: r.id }} submit="Guardar personajes" submitClass={`${buttonGhost} py-1 text-xs`}>
                              <ChecksPersonajes personajes={personajes} marcados={(r.credit_characters ?? []).map((c) => c.character_id)} />
                            </ActionForm>
                          </div>
                        </details>
                      ) : g.papel && (
                        <div className="mt-1 max-w-sm">
                          <ActionForm inline action={updatePapel} hidden={{ pid: id, id: r.id }} submit="Guardar" submitClass={`${buttonGhost} py-1 text-xs`}>
                            <input className={`${input} min-w-0 flex-1 py-1.5 text-sm`} name="papel" defaultValue={r.papel ?? ""} aria-label={g.papel} />
                          </ActionForm>
                        </div>
                      )}
                    </div>
                    <ImageUpload compact productionId={id} kind="retrato" carpeta="creditos" base={r.people?.nombre ?? "retrato"} save={setCreditPhoto.bind(null, id, r.id)} label={r.foto_path ? "Cambiar foto" : "Subir foto"} />
                    {ELENCO.has(r.tipo) && (
                      <ActionForm inline action={setSoloCredito} hidden={{ pid: id, id: r.id, solo: r.solo_credito ? "0" : "1" }}
                        confirm={r.solo_credito ? `¿${r.people?.nombre} vuelve a ser integrante (ensayos, expediente, gafete)?` : `¿Marcar a ${r.people?.nombre} como solo crédito? Sale en la página, pero no la citan a ensayos ni le cuentan faltas.`}
                        submit={r.solo_credito ? "Hacer integrante" : "Solo crédito"}
                        submitClass="rounded-full border border-white/25 px-3 py-1 text-xs font-bold" />
                    )}
                    {ELENCO.has(r.tipo) && (r.publicado ? (
                      <ActionForm inline action={setCreditPublicado} hidden={{ pid: id, id: r.id, publicado: "0" }}
                        confirm={`¿Quitar a ${r.people?.nombre} de la página? Sigue en el elenco y con su acceso.`}
                        submit="Despublicar" submitClass="rounded-full border border-white/25 px-3 py-1 text-xs font-bold" />
                    ) : (
                      <details className="relative">
                        <summary className="cursor-pointer rounded-full bg-texto px-3 py-1 text-xs font-bold text-sala">Publicar</summary>
                        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-white/15 bg-telon p-3 text-xs sm:absolute sm:right-0 sm:z-20 sm:w-80">
                          <ActionForm action={setCreditPublicado} hidden={{ pid: id, id: r.id, publicado: "1" }} submit="Publicar ahora" submitClass="self-start rounded-full bg-texto px-3 py-1 text-xs font-bold text-sala">
                            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="avisar" /> Avisar al Club Fan</label>
                          </ActionForm>
                          <ActionForm action={programarCredito} hidden={{ pid: id, id: r.id }} submit={r.publicar_at ? "Cambiar hora" : "Programar"} submitClass="self-start rounded-full border border-white/25 px-3 py-1 text-xs font-bold">
                            <label className="flex flex-col gap-1 font-semibold">O que salga solo (hora de México)
                              <input type="datetime-local" name="fecha" required defaultValue={r.publicar_at ? isoToLocalMx(r.publicar_at) : ""} className={`${input} py-1.5 text-xs`} />
                            </label>
                            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="avisar" /> Avisar al Club Fan al salir</label>
                          </ActionForm>
                          {r.publicar_at && <ActionForm inline action={programarCredito} hidden={{ pid: id, id: r.id, cancelar: "1" }} submit="Cancelar programación" submitClass="self-start text-xs font-bold text-texto-3 hover:text-texto" />}
                        </div>
                      </details>
                    ))}
                    {ELENCO.has(r.tipo) && (
                      <span className="flex items-center gap-1 text-xs text-texto-3">Tarjeta:
                        <a href={`/panel/producciones/${id}/elenco/tarjeta/${r.id}?f=post`} download className="font-bold text-violeta-claro">Post</a>·
                        <a href={`/panel/producciones/${id}/elenco/tarjeta/${r.id}?f=historia`} download className="font-bold text-violeta-claro">Historia</a>
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {i > 0 && <ActionForm inline action={moveCredit} hidden={{ pid: id, id: r.id, dir: "up" }} submit={<Icono nombre="flecha-arriba" etiqueta="Subir" />} submitClass={mini} />}
                      {i < items.length - 1 && <ActionForm inline action={moveCredit} hidden={{ pid: id, id: r.id, dir: "down" }} submit={<Icono nombre="flecha-abajo" etiqueta="Bajar" />} submitClass={mini} />}
                      <ActionForm inline action={removeCredit} hidden={{ pid: id, id: r.id }} confirm={`¿Quitar a ${r.people?.nombre} de ${g.titulo.toLowerCase()}? Solo deja de salir en la página; si es integrante, su baja se hace en Expedientes.`} submit={<Icono nombre="x" etiqueta="Quitar" />} submitClass={mini} />
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="py-2 text-sm text-texto-3">Nadie todavía.</li>}
              </ul>
              <AddCreditForm pid={id} tipo={g.tipo} papelLabel={g.papel} listId={listId} personajes={personajes} />
            </section>
          </Card>
        );
      })}
    </div>
  );
}
