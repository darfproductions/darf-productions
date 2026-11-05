"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { input } from "@/components/panel/ui";
import { revisarVarias } from "../../actions";

export type FilaSolicitud = {
  id: string; nombre: string; edad: number | null; creada: string; creadaTexto: string; estado: string; estadoLabel: string; estadoCls: string;
  personajes: string; horario: string | null; horarioIso: string | null; grupo: string | null; con: string | null; faltan: string;
  telefono: string; enRevision: boolean; puedePedir: boolean; regresada: boolean; href: string;
};
type Col = { k: keyof FilaSolicitud; label: string; cls?: string };
const COLS: Col[] = [
  { k: "nombre", label: "Nombre" }, { k: "edad", label: "Edad", cls: "w-14" }, { k: "creada", label: "Inscripción", cls: "w-28" },
  { k: "estadoLabel", label: "Estado", cls: "w-28" }, { k: "personajes", label: "Personajes" }, { k: "horarioIso", label: "Horario", cls: "w-32" },
  { k: "grupo", label: "Grupo", cls: "w-20" }, { k: "con", label: "Pasa con" }, { k: "faltan", label: "Le falta" },
];

// 0136: Solicitudes como tabla. Clic en el encabezado para ordenar; casillas para aprobar, regresar con nota o pedir
// que completen en lote. En celular se usan las tarjetas de siempre.
export function TablaSolicitudes({ aid, filas, columnas }: { aid: string; filas: FilaSolicitud[]; columnas?: (keyof FilaSolicitud)[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [orden, setOrden] = useState<{ k: keyof FilaSolicitud; asc: boolean }>({ k: "creada", asc: false });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const cols = COLS.filter((c) => !columnas || columnas.includes(c.k));
  const lista = useMemo(() => {
    const v = (f: FilaSolicitud) => f[orden.k];
    return [...filas].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
      return orden.asc ? r : -r;
    });
  }, [filas, orden]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = lista.length > 0 && lista.every((f) => sel.has(f.id));
  const accion = (a: "aprobar" | "regresar" | "completar") => start(async () => {
    const ids = [...sel];
    const elegibles = a === "completar" ? ids.filter((id) => filas.find((f) => f.id === id)?.puedePedir) : ids.filter((id) => filas.find((f) => f.id === id)?.enRevision || a === "regresar");
    if (!elegibles.length) { setMsg({ ok: false, texto: a === "completar" ? "A las seleccionadas no se les puede pedir (ya se registraron o no tienen cuenta)." : "Palomea solicitudes en revisión." }); return; }
    if (a === "regresar" && !nota.trim() && !confirm("¿Regresar sin nota? Se les avisará solo lo que les falta.")) return;
    if (a === "aprobar" && !confirm(`¿Aprobar ${elegibles.length} ${elegibles.length === 1 ? "solicitud" : "solicitudes"}? Pasan a la lista del día y les llega el aviso.`)) return;
    const r = await revisarVarias(aid, elegibles, a, nota);
    setMsg({ ok: r.ok, texto: r.message });
    if (r.ok) { setSel(new Set()); setNota(""); router.refresh(); }
  });
  const flecha = (k: keyof FilaSolicitud) => orden.k === k ? <Icono nombre={orden.asc ? "flecha-arriba" : "flecha-abajo"} className="ml-1 h-3 w-3" /> : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-telon-2 p-3 text-sm">
        <span className="font-semibold">{sel.size ? `${sel.size} ${sel.size === 1 ? "seleccionada" : "seleccionadas"}` : "Palomea solicitudes para actuar en lote"}</span>
        <button type="button" disabled={pending || !sel.size} onClick={() => accion("aprobar")} className="rounded-full bg-[#22c55e] px-3 py-1.5 text-xs font-bold text-[#052e16] disabled:opacity-40">Aprobar</button>
        <button type="button" disabled={pending || !sel.size} onClick={() => accion("completar")} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Pedir que completen</button>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <input className={`${input} min-w-0 flex-1 py-1.5 text-xs`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Nota para regresar (ej. Falta la foto de cuerpo completo)" aria-label="Nota para regresar" />
          <button type="button" disabled={pending || !sel.size} onClick={() => accion("regresar")} className="rounded-full border border-aviso/60 px-3 py-1.5 text-xs font-bold text-aviso disabled:opacity-40">Regresar con nota</button>
        </span>
        {msg && <span role="status" className={`w-full text-xs font-semibold ${msg.ok ? "text-exito" : "text-aviso"}`}>{msg.texto}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-telon-2 text-left text-xs uppercase tracking-wide text-texto-3">
            <tr>
              <th className="w-8 px-2 py-2"><input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(lista.map((f) => f.id)))} aria-label="Seleccionar todas" /></th>
              {cols.map((c) => (
                <th key={c.k} className={`px-2 py-2 ${c.cls ?? ""}`}>
                  <button type="button" onClick={() => setOrden((o) => ({ k: c.k, asc: o.k === c.k ? !o.asc : true }))} className="flex items-center font-bold hover:text-texto" aria-sort={orden.k === c.k ? (orden.asc ? "ascending" : "descending") : "none"}>
                    {c.label}{flecha(c.k)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id} className={`border-t border-white/10 ${sel.has(f.id) ? "bg-lila/10" : "hover:bg-white/5"}`}>
                <td className="px-2 py-2"><input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Seleccionar a ${f.nombre}`} /></td>
                {cols.map((c) => (
                  <td key={c.k} className="px-2 py-2 align-top">
                    {c.k === "nombre" ? <><Link href={f.href} className="font-bold hover:underline">{f.nombre}</Link><span className="block text-xs text-texto-3">{f.telefono}</span></>
                      : c.k === "estadoLabel" ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.estadoCls}`}>{f.estadoLabel}{f.regresada ? " · regresada" : ""}</span>
                      : c.k === "creada" ? f.creadaTexto
                      : c.k === "horarioIso" ? (f.horario ?? <span className="text-texto-3">—</span>)
                      : c.k === "faltan" ? (f.faltan ? <span className="font-semibold text-aviso">{f.faltan}</span> : <span className="text-texto-3">—</span>)
                      : (f[c.k] ?? <span className="text-texto-3">—</span>)}
                  </td>
                ))}
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={cols.length + 1} className="px-3 py-4 text-texto-3">No hay solicitudes con este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
