import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MiniAction } from "@/components/panel/MiniAction";
import { Card } from "@/components/panel/ui";
import { listMembers, listRoles } from "@/lib/panel-data";
import { can, groupMembers } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { AddMemberForm } from "./AddMemberForm";
import { EditRolesForm } from "./EditRolesForm";
import { invitacionAccion, removeMember } from "./actions";
import { InvitacionBotones } from "@/components/panel/InvitacionBotones";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";

type Invitacion = { id: string; email: string; roles: string[]; token: string; created_at: string; expira_at: string; enviado_at: string | null; envio_error: string | null };
const vencio = (iso: string) => new Date(iso).getTime() < Date.now();
const dia = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

export const metadata: Metadata = { title: "Permisos de la obra" };

// Quién tiene qué rol en ESTA obra. Solo con permisos.gestionar (la base lo exige).
export default async function ProductionPermissions({ params }: PageProps<"/panel/producciones/[id]/permisos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/permisos`);
  if (!can(access, id, "permisos.gestionar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [miembros, { roles, permissions, grants }, inv, obra] = await Promise.all([
    listMembers(id),
    listRoles(),
    supabase.from("production_invites").select("id, email, roles, token, created_at, expira_at, enviado_at, envio_error")
      .eq("production_id", id).is("aceptada_at", null).is("cancelada_at", null).order("created_at", { ascending: false }),
    supabase.from("productions").select("nombre").eq("id", id).maybeSingle(),
  ]);
  const invitaciones = (inv.data ?? []) as Invitacion[];
  const nombreRol = new Map(roles.map((r) => [r.id, r.nombre]));
  const desc = new Map(permissions.map((p) => [p.id, p.descripcion]));
  const personas = groupMembers(miembros);
  // Dirección general de DARF (0111) se asigna sola en todas las obras: se ve, pero no se da ni se quita aquí.
  const opciones = roles.filter((r) => r.id !== "integrante" && r.id !== "direccion_general_darf");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Dar acceso</h2>
          <p className="mt-1 text-sm text-texto-2">
            Escribe su correo: si ya tiene cuenta en DARF entra de inmediato; si no, queda invitada y le mandas la liga
            (al crear su cuenta con ese correo entra sola). Puede tener varios roles y suma los permisos de todos
            (por ejemplo Mesa de registro + Puerta + Staff). Crea un rol personalizado solo si necesitas una
            combinación de permisos que ningún rol tiene.
          </p>
        </div>
        <AddMemberForm pid={id} roles={opciones} />
      </Card>

      {invitaciones.length > 0 && (
        <Card className="p-0 md:p-0">
          <h2 className="titular px-5 pt-5 text-xl">Invitaciones pendientes ({invitaciones.length})</h2>
          <ul className="mt-3 divide-y divide-white/10">
            {invitaciones.map((i) => {
              const vencida = vencio(i.expira_at);
              const nombres = i.roles.map((r) => nombreRol.get(r) ?? r);
              return (
                <li key={i.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{i.email}</p>
                      <p className="text-sm text-texto-3">
                        {nombres.join(", ")} · invitada el {dia(i.created_at)} ·{" "}
                        {vencida ? <b className="text-aviso">venció</b> : `vence el ${dia(i.expira_at)}`}
                        {" · "}{i.enviado_at ? "correo enviado" : i.envio_error ? <span className="text-aviso">{i.envio_error}</span> : "correo no enviado (manda la liga)"}
                      </p>
                    </div>
                    <span className="flex flex-wrap gap-2">
                      <MiniAction action={invitacionAccion} hidden={{ pid: id, id: i.id, accion: "reenviar" }} label="Reenviar"
                        buttonClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50" />
                      <MiniAction action={invitacionAccion} hidden={{ pid: id, id: i.id, accion: "cancelar" }} confirm={`¿Cancelar la invitación de ${i.email}? Su liga deja de servir.`} label="Cancelar"
                        buttonClass="rounded-full px-3 py-1.5 text-xs font-bold text-texto-3 underline" />
                    </span>
                  </div>
                  {!vencida && <InvitacionBotones token={i.token} obra={(obra.data?.nombre as string) ?? "la obra"} roles={nombres} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-0 md:p-0">
        <h2 className="titular px-5 pt-5 text-xl">Equipo con acceso ({personas.length})</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {personas.map((m) => (
            <li key={m.user_id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.nombre || "Sin nombre"}</p>
                  <p className="truncate text-sm text-texto-3">{m.email}</p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {m.roles.map((r) => r.role_id === "direccion_general_darf" ? (
                    <li key={r.rowId} title="Se asigna sola en todas las obras" className="rounded-full bg-telon-2 px-3 py-1 text-sm font-semibold">{r.role_nombre}</li>
                  ) : (
                    <li key={r.rowId}>
                      <MiniAction action={removeMember} hidden={{ pid: id, id: r.rowId }} confirm={`¿Quitar el rol ${r.role_nombre} a ${m.nombre || m.email}?`}
                        className="flex flex-wrap items-center gap-1 rounded-full bg-telon-2 py-1 pl-3 pr-1 text-sm font-semibold"
                        buttonClass="grid h-6 w-6 place-items-center rounded-full text-texto-3 hover:bg-white/10 hover:text-texto" label={<Icono nombre="x" />} ariaLabel={`Quitar ${r.role_nombre}`}>
                        {r.role_nombre}
                      </MiniAction>
                    </li>
                  ))}
                </ul>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Editar roles</summary>
                <EditRolesForm pid={id} userId={m.user_id} email={m.email} roles={opciones} current={m.roles.map((r) => r.role_id)} />
              </details>
            </li>
          ))}
          {personas.length === 0 && <li className="px-5 py-4 text-texto-2">Nadie todavía. El Director siempre tiene acceso.</li>}
        </ul>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer font-bold">¿Qué puede hacer cada rol?</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <li key={r.id} className="rounded-lg bg-sala p-3 text-sm">
                <p className="font-bold">{r.nombre}{!r.es_sistema && <span className="ml-2 text-xs text-texto-3">personalizado</span>}</p>
                <p className="mt-1 text-texto-2">
                  {[...(grants.get(r.id) ?? [])].map((p) => desc.get(p) ?? p).join(" · ") || "Sin permisos administrativos"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}
