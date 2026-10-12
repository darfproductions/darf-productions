import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card, Notice, PanelTitle, button, buttonGhost, input } from "@/components/panel/ui";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { changeGlobalRole } from "./actions";

export const metadata: Metadata = { title: "Usuarios" };

type UserRow = { id: string; email: string; nombre: string | null; rol: "fan" | "staff" | "admin"; created_at: string };
const ROL_LABEL = { fan: "Fan", staff: "Staff (toda la boletería)", admin: "Director" } as const;

// Solo el Director: buscar cuentas y cambiar su rol general.
// Los roles por obra se dan dentro de cada obra → Permisos.
export default async function UsersPage({ searchParams }: PageProps<"/panel/usuarios">) {
  const access = await requireDirector("/panel/usuarios");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", { q: q || null });
  const users = (data ?? []) as UserRow[];

  return (
    <>
      <PanelTitle eyebrow="Director" title="Usuarios">
        El rol general aplica a toda la plataforma. Para dar acceso a una sola obra, usa la pestaña Permisos de esa obra.
      </PanelTitle>
      {typeof sp.error === "string" && <Notice>{sp.error}</Notice>}
      {sp.ok === "1" && <Notice ok>Rol actualizado.</Notice>}
      {error && <Notice>{error.message}</Notice>}
      <form className="flex gap-2">
        <input className={`${input} flex-1`} name="q" defaultValue={q} placeholder="Buscar por nombre o correo" />
        <button className={button}>Buscar</button>
      </form>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.nombre || "Sin nombre"}{u.id === access.session.userId && <span className="ml-2 text-xs text-texto-3">(tú)</span>}</p>
                <p className="truncate text-sm text-texto-3">{u.email} · {ROL_LABEL[u.rol]} · <Link href={`/panel/talento/${u.id}`} className="font-bold text-violeta-claro">Ficha</Link></p>
              </div>
              <form action={changeGlobalRole} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="q" value={q} />
                <select name="rol" defaultValue={u.rol} className={input} aria-label={`Rol de ${u.email}`}>
                  <option value="fan">Fan</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Director</option>
                </select>
                <ConfirmSubmit message={`¿Cambiar el rol general de ${u.email}?`} className={buttonGhost}>Guardar</ConfirmSubmit>
              </form>
            </li>
          ))}
          {users.length === 0 && <li className="px-5 py-4 text-texto-2">Sin resultados.</li>}
        </ul>
      </Card>
    </>
  );
}
