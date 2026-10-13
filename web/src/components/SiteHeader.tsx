import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canSeePanel } from "@/lib/permissions";
import { avatarUrl } from "@/lib/avatar";
import { esSocio } from "@/lib/credencial";
import { MainNav } from "./MainNav";
import { MenuCuenta } from "./MenuCuenta";
import { MobileMenu } from "./MobileMenu";

export const NAV_LINKS = [
  { href: "/producciones", label: "Producciones" },
  { href: "/audiciones", label: "Audiciones" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/contacto", label: "Contacto" },
  { href: "/eventos", label: "Eventos" },
  // Al final: el dorado de la Fan Zone no corta el menú (decisión de Diego).
  { href: "/fan-zone", label: "Fan Zone" },
];

// Encabezado (guía de UI): vidrio sobre la sala, línea de luz abajo, logo original del kit
// (DARF con PRODUCTIONS abajo), menú centrado y a la derecha cuenta + "Boletos".
export async function SiteHeader() {
  const session = await getSession();
  // Panel: staff, Director o quien tenga un rol en alguna obra (0031).
  const [isStaff, foto, socio] = await Promise.all([
    canSeePanel(session),
    session ? avatarUrl(session.profile?.foto_path) : Promise.resolve(null),
    session ? esSocio() : Promise.resolve(false),
  ]);
  const account = session ? { href: "/cuenta", label: "Mi cuenta" } : { href: "/entrar", label: "Entrar" };

  return (
    <header className="relative z-20 border-b border-linea bg-sala/60 backdrop-blur-[18px] print:hidden">
      <div aria-hidden="true" className="absolute inset-x-0 -bottom-px h-px bg-[linear-gradient(90deg,transparent,rgb(131_8_134/0.9),rgb(210_1_34/0.7),transparent)]" />
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between gap-4 px-5 md:px-16 lg:h-[88px]">
        <Link href="/" aria-label="DARF Productions, inicio" className="flex shrink-0">
          <Image src="/marca/darf-principal.svg" alt="DARF Productions" width={600} height={215} unoptimized priority className="h-9 w-auto lg:h-11" />
        </Link>

        <MainNav links={NAV_LINKS} />

        <div className="flex items-center gap-3 lg:gap-6">
          {session ? (
            <MenuCuenta nombre={session.profile?.nombre ?? ""} email={session.email} fotoUrl={foto} panel={isStaff} socio={socio} />
          ) : (
            <Link href="/entrar" className="hidden whitespace-nowrap text-[13px] font-semibold text-texto-2 hover:text-white lg:inline">Entrar</Link>
          )}
          <Link href="/producciones?estado=cartelera" className="fb fb-luz fb-sm min-h-[38px] px-4 lg:min-h-[42px] lg:px-5">Boletos</Link>
          <MobileMenu links={NAV_LINKS} account={account} panel={isStaff} sesion={!!session} />
        </div>
      </div>
    </header>
  );
}
