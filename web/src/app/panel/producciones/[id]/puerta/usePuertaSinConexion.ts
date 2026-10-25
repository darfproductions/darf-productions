"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkIn, listaPuerta, type CheckIn } from "./actions";
import { conteoLocal, esFallaDeRed, marcarEntrada, resultadoSubida, unirLista, validarLocal, type EntradaFila, type ListaPuerta, type ResultadoLocal } from "./sin-conexion-rules";

// Puerta sin internet (2026-10-25): guarda en el celular la lista de la función, valida contra ella si la red no
// contesta y sube las entradas solas al volver la señal. Reglas en sin-conexion-rules.ts.

const CLAVE_LISTA = (f: string) => `darf-puerta-lista:${f}`;
const CLAVE_FILA = "darf-puerta-fila";
const leer = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const guardar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };

/** La promesa, o null si tarda más de `ms` o falla (sin red). */
export function conLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export type Resumen = { subidas: number; dobles: { nombre: string; lugar: string }[]; rechazadas: { nombre: string; lugar: string; motivo: string }[] };

export function usePuertaSinConexion(funcion: string) {
  const [lista, setLista] = useState<ListaPuerta | null>(null);
  const [fila, setFila] = useState<EntradaFila[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const filaRef = useRef<EntradaFila[]>([]);
  const listaRef = useRef<ListaPuerta | null>(null);
  const subiendoRef = useRef(false);

  const ponerFila = useCallback((f: EntradaFila[]) => { filaRef.current = f; setFila(f); guardar(CLAVE_FILA, f); }, []);
  const ponerLista = useCallback((l: ListaPuerta | null) => { listaRef.current = l; setLista(l); if (l) guardar(CLAVE_LISTA(l.funcion), l); }, []);

  // Al abrir o cambiar de función: lo guardado en este celular primero (sirve aunque no haya señal).
  useEffect(() => {
    filaRef.current = leer<EntradaFila[]>(CLAVE_FILA) ?? [];
    setFila(filaRef.current);
    const l = funcion ? leer<ListaPuerta>(CLAVE_LISTA(funcion)) : null;
    listaRef.current = l;
    setLista(l);
  }, [funcion]);

  const descargar = useCallback(async () => {
    if (!funcion || document.visibilityState === "hidden") return;
    const nueva = await conLimite(listaPuerta(funcion), 10_000);
    if (!nueva) { setEnLinea(false); return; }
    setEnLinea(true);
    ponerLista(unirLista(nueva, filaRef.current));
  }, [funcion, ponerLista]);

  /** Sube las entradas hechas sin internet (de cualquier función). Se detiene si la red vuelve a fallar. */
  const subir = useCallback(async () => {
    if (subiendoRef.current || !filaRef.current.length) return;
    subiendoRef.current = true;
    setSubiendo(true);
    const r: Resumen = { subidas: 0, dobles: [], rechazadas: [] };
    try {
      for (const e of [...filaRef.current]) {
        const res = await conLimite(checkIn(e.token, e.funcion), 8_000);
        if (esFallaDeRed(res)) { setEnLinea(false); break; }
        const quien = { nombre: (res && "buyer_nombre" in res && res.buyer_nombre) || "", lugar: (res && "seat_label" in res && res.seat_label) || "" };
        const s = resultadoSubida(res as { result: string; checked_in_at?: string | null }, e.at);
        if (s === "subida") r.subidas++;
        else if (s === "doble") r.dobles.push(quien);
        else r.rechazadas.push({ ...quien, motivo: res?.result ?? "" });
        ponerFila(filaRef.current.filter((x) => !(x.token === e.token && x.funcion === e.funcion)));
      }
    } finally {
      subiendoRef.current = false;
      setSubiendo(false);
      if (r.subidas || r.dobles.length || r.rechazadas.length) setResumen(r);
    }
  }, [ponerFila]);

  // Cada minuto (con la pestaña a la vista): sube lo pendiente y renueva la lista. También al volver la señal.
  useEffect(() => {
    const ciclo = async () => { await subir(); await descargar(); };
    void ciclo();
    const t = setInterval(ciclo, 60_000);
    const alVolver = () => { setEnLinea(true); void ciclo(); };
    const alCaer = () => setEnLinea(false);
    const alMostrar = () => { if (document.visibilityState === "visible") void ciclo(); };
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaer);
    document.addEventListener("visibilitychange", alMostrar);
    return () => { clearInterval(t); window.removeEventListener("online", alVolver); window.removeEventListener("offline", alCaer); document.removeEventListener("visibilitychange", alMostrar); };
  }, [subir, descargar]);

  /** Valida en línea (máx. 3 s); si la red no contesta, contra la lista guardada. */
  const validar = useCallback(async (token: string): Promise<{ r: CheckIn; local: false } | { r: ResultadoLocal; local: true } | null> => {
    const online = typeof navigator !== "undefined" && navigator.onLine === false ? null : await conLimite(checkIn(token, funcion), 3_000);
    if (!esFallaDeRed(online)) {
      setEnLinea(true);
      const r = online as CheckIn;
      if ((r.result === "ok" || r.result === "ya_usado") && listaRef.current) ponerLista(marcarEntrada(listaRef.current, token, r.result === "ya_usado" && r.checked_in_at ? r.checked_in_at : new Date().toISOString()));
      return { r, local: false };
    }
    setEnLinea(false);
    if (!listaRef.current) return null; // sin lista guardada no hay cómo revisar
    const r = validarLocal(listaRef.current, filaRef.current, token);
    if (r.result === "ok") {
      const at = new Date().toISOString();
      ponerFila([...filaRef.current, { token: token.trim().toLowerCase(), funcion, at }]);
      ponerLista(marcarEntrada(listaRef.current, token, at));
    }
    return { r, local: true };
  }, [funcion, ponerFila, ponerLista]);

  const pendientes = fila.length;
  const conteo = lista ? conteoLocal(lista, fila) : null;
  return { lista, enLinea, pendientes, subiendo, resumen, cerrarResumen: () => setResumen(null), validar, subir, conteo };
}
