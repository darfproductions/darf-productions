import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { Modo, Preferencia } from "~/lib/tema";

// Apariencia: Auto (sigue al teléfono), Día o Noche. Se guarda en el teléfono y pinta <html data-modo>.

const LLAVE = "darf.apariencia";

type Apariencia = { preferencia: Preferencia; modo: Modo; elegir: (p: Preferencia) => void; alternar: () => void };
const Ctx = createContext<Apariencia | null>(null);

function delSistema(): Modo {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "dia" : "noche";
}

export function AparienciaProvider({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<Preferencia>("auto");
  const [sistema, setSistema] = useState<Modo>(delSistema);

  useEffect(() => {
    Preferences.get({ key: LLAVE }).then(({ value }) => {
      if (value === "dia" || value === "noche" || value === "auto") setPreferencia(value);
    });
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const cambio = () => setSistema(delSistema());
    mq?.addEventListener("change", cambio);
    return () => mq?.removeEventListener("change", cambio);
  }, []);

  const modo: Modo = preferencia === "auto" ? sistema : preferencia;

  useEffect(() => {
    document.documentElement.dataset.modo = modo;
    if (Capacitor.isNativePlatform()) StatusBar.setStyle({ style: modo === "dia" ? Style.Light : Style.Dark }).catch(() => {});
  }, [modo]);

  const elegir = useCallback((p: Preferencia) => {
    setPreferencia(p);
    Preferences.set({ key: LLAVE, value: p });
  }, []);
  const alternar = useCallback(() => elegir(modo === "dia" ? "noche" : "dia"), [elegir, modo]);

  const valor = useMemo(() => ({ preferencia, modo, elegir, alternar }), [preferencia, modo, elegir, alternar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApariencia(): Apariencia {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApariencia fuera de AparienciaProvider");
  return v;
}
