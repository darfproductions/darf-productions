import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { env } from "~/lib/env";

type Carga<T> = { datos: T | null; error: string | null; cargando: boolean };

/** Carga datos al montar la pantalla (y cuando cambian `deps`). */
export function useCarga<T>(leer: () => Promise<T>, deps: unknown[]): Carga<T> {
  const [estado, setEstado] = useState<Carga<T>>({ datos: null, error: null, cargando: true });
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    leer()
      .then((datos) => vivo && setEstado({ datos, error: null, cargando: false }))
      .catch((e: unknown) => vivo && setEstado({ datos: null, error: e instanceof Error ? e.message : String(e), cargando: false }));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado;
}

/** Abre una página: dentro de la app (navegador integrado) en el teléfono, en otra pestaña en la computadora. */
export async function abrir(url: string) {
  if (Capacitor.isNativePlatform()) await Browser.open({ url, presentationStyle: "popover" });
  else window.open(url, "_blank", "noopener");
}

/** Abre una página de la web DARF (compra, Club de Fans, audiciones…). */
export function abrirWeb(ruta: string) {
  return abrir(env.siteUrl + ruta);
}
