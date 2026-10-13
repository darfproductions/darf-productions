"use client";

/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionForm } from "@/components/panel/ActionForm";
import { resumenEnvio } from "@/lib/votacion-rules";
import { mandarCast, moverEnCast } from "../../votacion-actions";

type Persona = { id: string; nombre: string; numero: number | null; foto_path: string | null; cuenta: boolean; votos?: number };
export type Tablero = {
  fase: string;
  roles: { id: string; nombre: string; asignados: Persona[]; pista: { id: string; nombre: string; votos: number }[] }[];
  ensamble: Persona[];
  fuera: Persona[];
};

const input = "rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-sm";

// Tablero del ajuste: columnas por personaje (en orden de importancia), Ensamble y No seleccionados.
// Se arrastra un nombre a otra columna o, en celular, se elige "Mover a…".
export function CastBoard({ aid, tablero, fotos, enviado, conObra }: { aid: string; tablero: Tablero; fotos: Record<string, string>; enviado: boolean; conObra: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [sobre, setSobre] = useState<string | null>(null);
  const destinos = [...tablero.roles.map((r) => ({ id: r.id, nombre: r.nombre })), { id: "ensamble", nombre: "Ensamble" }, { id: "fuera", nombre: "No seleccionados" }];

  const mover = (app: string, destino: string) => {
    setError("");
    start(async () => {
      const r = await moverEnCast(aid, app, destino);
      if (!r.ok) setError(r.message ?? "No se pudo mover.");
      router.refresh();
    });
  };

  const tarjeta = (p: Persona, actual: string) => (
    <li key={p.id} draggable={!enviado} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
      className={`flex flex-col gap-1.5 rounded-lg bg-sala px-2 py-1.5 text-sm ${enviado ? "" : "cursor-grab active:cursor-grabbing"}`}>
      <span className="flex items-center gap-2">
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-telon-2">{p.foto_path && fotos[p.foto_path] && <img src={fotos[p.foto_path]} alt="" className="h-full w-full object-cover" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight [overflow-wrap:anywhere]">{p.numero ? `Nº ${p.numero} · ` : ""}{p.nombre}</span>
        <span className="block text-[11px] text-texto-3">{p.votos !== undefined ? `${p.votos} ${p.votos === 1 ? "voto" : "votos"}` : ""}{!p.cuenta ? `${p.votos !== undefined ? " · " : ""}sin cuenta` : ""}</span>
      </span>
      </span>
      {!enviado && (
        <select aria-label={`Mover a ${p.nombre}`} value="" disabled={pending} onChange={(e) => e.target.value && mover(p.id, e.target.value)} className="w-full rounded-md border border-white/15 bg-telon px-1 py-1 text-xs">
          <option value="">Mover a…</option>
          {destinos.filter((d) => d.id !== actual).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      )}
    </li>
  );

  const columna = (id: string, titulo: string, personas: Persona[], extra?: React.ReactNode) => (
    <section key={id} aria-label={titulo}
      onDragOver={(e) => { if (!enviado) { e.preventDefault(); setSobre(id); } }}
      onDragLeave={() => setSobre((s) => (s === id ? null : s))}
      onDrop={(e) => { e.preventDefault(); setSobre(null); const app = e.dataTransfer.getData("text/plain"); if (app) mover(app, id); }}
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-3 transition ${sobre === id ? "border-lila bg-lila/10" : "border-white/10 bg-telon"}`}>
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-black uppercase tracking-[0.08em]">
        <span className="truncate">{titulo}</span><span className="text-xs font-bold text-texto-3">{personas.length}</span>
      </h3>
      <ul className="flex flex-col gap-1.5">{personas.map((p) => tarjeta(p, id))}</ul>
      {personas.length === 0 && <p className="text-xs text-texto-3">Vacío{enviado ? "" : ": arrastra aquí a alguien"}</p>}
      {extra}
    </section>
  );

  const cast = [...tablero.roles.flatMap((r) => r.asignados), ...tablero.ensamble];
  const resumen = resumenEnvio(cast, tablero.fuera);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        {enviado ? "Cast enviado. Las respuestas a las ofertas llegan a Elenco y equipos." : "Esta es la propuesta de la votación. Mueve a quien quieras arrastrando su nombre o con “Mover a…”: cada cambio se guarda solo."}
        {pending && <span className="ml-2 text-texto-3">Guardando…</span>}
      </p>
      {error && <p role="alert" className="text-sm text-[#ff8fa3]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tablero.roles.map((r) => columna(r.id, r.nombre, r.asignados,
          r.asignados.length === 0 && r.pista.length > 0 ? <p className="text-xs text-aviso">Más votados: {r.pista.map((p) => `${p.nombre} (${p.votos})`).join(", ")}</p> : undefined))}
        {columna("ensamble", "Ensamble", tablero.ensamble)}
        {columna("fuera", "No seleccionados", tablero.fuera)}
      </div>
      {!enviado && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-telon p-4">
          <h2 className="titular text-xl">Guardar y mandar</h2>
          <p className="text-sm text-texto-2">El cast ya está guardado con cada cambio y lo puedes seguir moviendo. Cuando esté listo, manda las ofertas.</p>
          <p className="text-sm font-semibold">{resumen.texto}</p>
          {!conObra ? <p className="text-sm text-aviso">Esta convocatoria no es de una obra: no hay a dónde mandar ofertas.</p> : (
            <ActionForm action={mandarCast} hidden={{ aid }} confirm={`${resumen.texto} ¿Mandar ahora? Ya no se podrá mover el cast.`} submit="Mandar ofertas y avisos">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Mensaje para quienes quedaron (opcional)
                <textarea name="mensaje" maxLength={2000} className={`${input} min-h-20 font-normal`} placeholder="¡Bienvenida al elenco! El primer ensayo es…" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Responder antes de (opcional)
                <input type="datetime-local" name="responder_antes" className={`${input} max-w-xs font-normal`} />
              </label>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
