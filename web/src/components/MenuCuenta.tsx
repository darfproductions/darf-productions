"use client";

/* eslint-disable @next/next/no-img-element -- foto de perfil firmada */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/entrar/actions";
import { iniciales } from "@/lib/gafete-rules";

// Botón de cuenta del encabezado (escritorio): foto o iniciales y un menú con Mi cuenta, Mis
// boletos, la credencial del Club Fan, el Panel (si aplica) y Cerrar sesión. Reemplaza los textos
// "Panel" y "Mi cuenta" para que la barra ocupe menos.
export function MenuCuenta({ nombre, email, fotoUrl, panel, socio }: { nombre: string; email: string; fotoUrl: string | null; panel: boolean; socio: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const path = usePathname();
  const [visto, setVisto] = useState(path);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  if (visto !== path) { setVisto(path); setAbierto(false); }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  const item = "block rounded-xl px-3 py-2.5 text-sm font-semibold text-texto-2 hover:bg-white/5 hover:text-white";
  return (
    <div ref={caja} className="relative hidden lg:block">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Cuenta de ${nombre || email}`}
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#340feb,#830886,#d20122)] text-sm font-black text-white ring-2 ring-white/15 hover:ring-white/40"
      >
        {fotoUrl ? <img src={fotoUrl} alt="" className="h-full w-full object-cover" /> : iniciales(nombre || email)}
      </button>
      {abierto && (
        <div role="menu" aria-label="Mi cuenta" className="absolute right-0 top-full z-50 mt-3 flex w-64 bg-telon flex-col gap-0.5 rounded-[20px] border border-linea-2 p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]">
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-bold text-texto">{nombre || "Mi cuenta"}</p>
            <p className="truncate text-xs text-texto-3">{email}</p>
          </div>
          <div className="border-t border-linea pt-1.5" />
          <Link role="menuitem" href="/cuenta" className={item}>Mi cuenta</Link>
          <Link role="menuitem" href="/cuenta#boletos" className={item}>Mis boletos</Link>
          <Link role="menuitem" href="/cuenta#credencial" className={item}>Mi credencial</Link>
          <Link role="menuitem" href="/cuenta/eventos" className={item}>Mis eventos</Link>
          {socio && <Link role="menuitem" href="/fan-zone" className={`${item} !text-oro-claro`}>Fan Zone</Link>}
          {panel && <Link role="menuitem" href="/panel" className={item}>Panel</Link>}
          <div className="mt-1 border-t border-linea pt-1.5">
            <form action={logout}>
              <button role="menuitem" type="submit" className={`${item} w-full text-left`}>Cerrar sesión</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
