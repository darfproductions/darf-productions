"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { input } from "@/components/panel/ui";
import { gruposCierre, validarCallback, type PersonaCierre } from "@/lib/audicion-vivo-rules";
import { cerrarRonda } from "../../actions";

const grande = "flex flex-1 flex-col items-start gap-1 rounded-2xl border-2 px-5 py-4 text-left transition disabled:opacity-60";

// 0131: el host (o quien gestiona) termina las audiciones: directo a votación o callbacks (hoy u otra fecha).
// En la ronda de callback solo queda "Ir a votación".
export function Terminar({ aid, fase, faltan, personajes, personas }: {
  aid: string; fase: string; faltan: number;
  personajes: { id: string; nombre: string }[]; personas: PersonaCierre[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paso, setPaso] = useState<"inicio" | "callback">("inicio");
  const [llamados, setLlamados] = useState<Set<string>>(() => new Set(personas.filter((p) => p.estado === "callback").map((p) => p.id)));
  const [cuando, setCuando] = useState<"hoy" | "otra_fecha" | "">("");
  const [fecha, setFecha] = useState("");
  const [lugar, setLugar] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const grupos = useMemo(() => gruposCierre(personajes, personas), [personajes, personas]);
  const enCallback = fase === "callback";

  const correr = (p: Parameters<typeof cerrarRonda>[1], pregunta: string) => {
    if (!confirm(pregunta)) return;
    start(async () => {
      const r = await cerrarRonda(aid, p);
      setMsg({ ok: r.ok, texto: r.message });
      if (r.ok) { setPaso("inicio"); router.refresh(); }
    });
  };
  const aVotar = () => correr({ destino: "votacion" },
    `${faltan ? `Todavía ${faltan === 1 ? "falta 1 persona" : `faltan ${faltan} personas`} por pasar. ` : ""}¿Terminar ${enCallback ? "el callback" : "las audiciones"} e ir a votación? Los jueces pasan a votar.`);
  const llamar = () => {
    const err = validarCallback(cuando, cuando === "otra_fecha" ? `${fecha}:00-06:00` : null, llamados.size);
    if (err) { setMsg({ ok: false, texto: err }); return; }
    correr({ destino: "callback", pasan: [...llamados], cuando: cuando as "hoy" | "otra_fecha", fecha, lugar },
      `¿Llamar a ${llamados.size} ${llamados.size === 1 ? "persona" : "personas"} a callback ${cuando === "hoy" ? "hoy mismo" : "en la fecha que pusiste"}? Se les avisa en su cuenta${cuando === "otra_fecha" ? " y por correo con su QR" : ""}.`);
  };
  const cambiar = (id: string) => setLlamados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section aria-label="Terminar audiciones" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-telon p-5">
      <div>
        <h2 className="titular text-xl">{enCallback ? "Terminar el callback" : "Terminar audiciones"}</h2>
        <p className="text-sm text-texto-2">{faltan ? `${faltan === 1 ? "Falta 1 persona" : `Faltan ${faltan} personas`} por pasar (de quienes ya llegaron).` : "Ya pasaron todos los que llegaron."} Cuando terminen, elige qué sigue.</p>
      </div>

      {paso === "inicio" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" disabled={pending} onClick={aVotar} className={`${grande} border-texto/60 hover:border-texto`}>
            <b className="text-lg">Ir a votación <Icono nombre="flecha-der" /></b>
            <span className="text-sm text-texto-2">{enCallback ? "Los jueces votan con lo que vieron en el callback." : "Sin callback: los jueces votan con lo que vieron hoy."}</span>
          </button>
          {!enCallback && (
            <button type="button" disabled={pending} onClick={() => { setMsg(null); setPaso("callback"); }} className={`${grande} border-lila/60 hover:border-lila`}>
              <b className="text-lg">Hacer callbacks <Icono nombre="flecha-der" /></b>
              <span className="text-sm text-texto-2">Eliges a quién llamas por personaje, hoy mismo o en otra fecha.</span>
            </button>
          )}
        </div>
      )}

      {paso === "callback" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto-2">Palomea a quién llamas. Arriba de cada personaje van quienes más marcaron los jueces (y su promedio, si calificaron). Una persona puede salir en varios personajes: se llama una sola vez.</p>
          {grupos.length === 0 && <p className="text-sm text-texto-3">Todavía no ha pasado nadie.</p>}
          {grupos.map((g) => (
            <fieldset key={g.id} className="flex flex-col gap-1 rounded-xl bg-sala p-3">
              <legend className="px-1 text-sm font-bold uppercase tracking-widest text-lila">{g.nombre}</legend>
              {g.personas.map((p) => (
                <label key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                  <input type="checkbox" checked={llamados.has(p.id)} onChange={() => cambiar(p.id)} className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <b>{p.numero ? `Nº ${p.numero} · ` : ""}{p.nombre}</b>
                    <span className="block text-xs text-texto-3">
                      {p.marcasAqui ? `${p.marcasAqui} ${p.marcasAqui === 1 ? "marca" : "marcas"} de jueces` : "Sin marcas"}
                      {p.promedio != null ? ` · promedio ${p.promedio}` : ""}
                      {!p.paso ? " · no ha pasado" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          <div className="flex flex-col gap-2 rounded-xl bg-sala p-3">
            <p className="text-sm font-bold">¿Cuándo es el callback?</p>
            <div className="flex flex-wrap gap-2">
              {([["hoy", "Hoy mismo"], ["otra_fecha", "Otra fecha"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setCuando(v)} aria-pressed={cuando === v}
                  className={`rounded-full border px-4 py-2 text-sm font-bold ${cuando === v ? "border-texto bg-texto text-sala" : "border-white/25"}`}>{l}</button>
              ))}
            </div>
            {cuando === "otra_fecha" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold">Fecha y hora<input className={input} type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">Lugar (opcional)<input className={input} value={lugar} maxLength={200} onChange={(e) => setLugar(e.target.value)} placeholder="Si es otro lugar" /></label>
              </div>
            )}
            {cuando === "hoy" && <p className="text-xs text-texto-3">La fila se arma solo con los llamados; siguen registrados y se usa el mismo botón Siguiente.</p>}
            {cuando === "otra_fecha" && <p className="text-xs text-texto-3">Les llega el aviso con fecha, lugar y su mismo QR (y un recordatorio un día antes). Ese día se escanean en la entrada.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} onClick={llamar} className="rounded-full bg-texto px-5 py-3 text-sm font-bold text-sala disabled:opacity-60">
              {pending ? "Un momento…" : `Llamar a callback (${llamados.size})`}
            </button>
            <button type="button" disabled={pending} onClick={() => setPaso("inicio")} className="rounded-full border border-white/25 px-4 py-3 text-sm font-bold">Regresar</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-exito" : "text-aviso"}`}>{msg.texto}</p>}
    </section>
  );
}
