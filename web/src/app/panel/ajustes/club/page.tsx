import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PanelTitle, button, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { buscarSocios, getSocios } from "@/lib/club-socios";
import { numeroSocio } from "@/lib/fanzone-rules";
import { pesos } from "@/lib/member-rules";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Club Fan" };

const fecha = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "—");
const cumple = (d: string | null) => (d ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "—");

// Base del Club Fan (0112): quiénes están dados de alta, con número de socio, datos, cumpleaños,
// producciones (DARF Loyalty), visitas y compras. Para el admin y Casa DARF con el permiso "Club Fan".
export default async function ClubFanBase({ searchParams }: PageProps<"/panel/ajustes/club">) {
  const access = await requirePanel("/panel/ajustes/club");
  if (!casa(access, "casa.club")) redirect("/panel");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const orden = sp.orden === "compras" ? "compras" : sp.orden === "visitas" ? "visitas" : "numero";
  const socios = await getSocios();
  const lista = buscarSocios(socios, q).sort((a, b) => orden === "compras" ? b.gastado - a.gastado : orden === "visitas" ? b.visitas - a.visitas : a.numero - b.numero);
  const total = socios.reduce((s, x) => s + Number(x.gastado), 0);
  const liga = (o: string) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(o !== "numero" ? { orden: o } : {}) })}`;
  const pill = (activo: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold ${activo ? "border-texto bg-texto text-sala" : "border-white/25"}`;

  return (
    <>
      <PanelTitle eyebrow="Sitio y público" title="Club Fan">
        Todos los socios del Club Fan con su número, datos, cumpleaños, producciones en DARF, visitas y compras. Son datos personales: no los compartas fuera del equipo.
      </PanelTitle>
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center"><p className="text-2xl font-black">{socios.length}</p><p className="text-xs text-texto-3">Socios</p></Card>
        <Card className="text-center"><p className="text-2xl font-black">{socios.filter((s) => s.numero <= 100).length}</p><p className="text-xs text-texto-3">Fundadores</p></Card>
        <Card className="text-center"><p className="text-2xl font-black">{pesos(total)}</p><p className="text-xs text-texto-3">Compras de socios</p></Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex min-w-0 flex-1 basis-72 gap-2">
          <input className={`${input} min-w-0 flex-1`} name="q" defaultValue={q} placeholder="Buscar por nombre, correo, teléfono o número" />
          {orden !== "numero" && <input type="hidden" name="orden" value={orden} />}
          <button className={button}>Buscar</button>
        </form>
        <a href="/panel/ajustes/club/exportar" className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">Exportar (Excel) <Icono nombre="flecha-abajo" /></a>
      </div>
      <nav aria-label="Orden" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-3">Orden:</span>
        <Link href={liga("numero")} className={pill(orden === "numero")}>Número de socio</Link>
        <Link href={liga("compras")} className={pill(orden === "compras")}>Más compras</Link>
        <Link href={liga("visitas")} className={pill(orden === "visitas")}>Más visitas</Link>
      </nav>
      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
            <tr>{["Socio", "Nombre", "Contacto", "Cumpleaños", "Producciones", "Visitas", "Compras", "Desde"].map((t) => <th key={t} className="px-4 py-3">{t}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {lista.map((s) => (
              <tr key={s.user_id}>
                <td className="px-4 py-3 font-bold text-oro-claro">{numeroSocio(s.numero)}{s.numero <= 100 && <span className="block text-[10px] font-normal text-texto-3">Fundador</span>}</td>
                <td className="px-4 py-3"><Link href={`/panel/talento/${s.user_id}`} className="font-bold hover:underline">{s.nombre}</Link></td>
                <td className="px-4 py-3 text-xs"><span className="block">{s.email}</span>{s.telefono && <a href={`tel:${s.telefono}`} className="text-texto-3 underline">{s.telefono}</a>}</td>
                <td className="px-4 py-3">{cumple(s.fecha_nacimiento)}</td>
                <td className="px-4 py-3">{s.producciones}</td>
                <td className="px-4 py-3">{s.visitas}</td>
                <td className="px-4 py-3">{s.compras ? <><b>{pesos(Number(s.gastado))}</b><span className="block text-xs text-texto-3">{s.compras} {s.compras === 1 ? "compra" : "compras"} · {s.boletos} boletos · última {fecha(s.ultima_compra)}</span></> : <span className="text-texto-3">Sin compras</span>}</td>
                <td className="px-4 py-3 text-xs">{fecha(s.desde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="px-5 py-4 text-texto-2">{q ? "Nadie coincide con la búsqueda." : "Aún no hay socios."}</p>}
      </Card>
    </>
  );
}
