"use client";

import { useState } from "react";
import { input } from "@/components/panel/ui";
import { GENEROS, HABILIDADES, NIVELES, TESITURAS, type Categoria, type PersonajeFicha } from "@/lib/produccion-nueva-rules";

const chip = "flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold has-[:checked]:border-lila has-[:checked]:bg-lila/15 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lila";
const etiqueta = "flex flex-col gap-1.5 text-sm font-semibold";

// Campos de un personaje o grupo de ensamble (0135). Sin canto, no se pide tesitura; en ensamble, cuántas personas.
export function PersonajeCampos({ categoria, p, canciones }: { categoria: Categoria; p?: Partial<PersonajeFicha>; canciones: { id: string; titulo: string }[] }) {
  const [canto, setCanto] = useState(p?.canto ?? "");
  const ensamble = categoria === "ensamble";
  const otras = (p?.habilidades ?? []).filter((h) => !HABILIDADES.includes(h)).join(", ");
  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="categoria" value={categoria} />
      <div className={`grid gap-3 ${ensamble ? "sm:grid-cols-[2fr_1fr]" : ""}`}>
        <label className={etiqueta}>{ensamble ? "Grupo" : "Personaje"}
          <input className={input} name="nombre" required defaultValue={p?.nombre ?? ""} placeholder={ensamble ? "Ej. Porristas" : "Ej. Lela"} maxLength={80} />
        </label>
        {ensamble && (
          <label className={etiqueta}>¿Cuántas personas?
            <input className={input} name="cupo" type="number" min={1} max={200} defaultValue={p?.cupo ?? 1} />
          </label>
        )}
      </div>
      <label className={etiqueta}>Descripción
        <textarea className={input} name="descripcion" rows={3} maxLength={1500} defaultValue={p?.descripcion ?? ""}
          placeholder={ensamble ? "Qué hacen en la obra y qué perfil buscamos." : "Quién es, cómo es, qué le pasa en la obra."} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>{ensamble ? "Quiénes" : "Interpreta"}
          <select className={input} name="genero" defaultValue={p?.genero ?? ""}>
            <option value="">Sin especificar</option>
            {GENEROS.map((g) => <option key={g.valor} value={g.valor}>{ensamble && g.valor !== "cualquiera" ? (g.valor === "mujer" ? "Mujeres" : "Hombres") : g.label}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Edad que aparenta (de)
          <input className={input} name="edad_min" type="number" min={0} max={100} defaultValue={p?.edad_min ?? ""} placeholder="16" />
        </label>
        <label className={etiqueta}>(a)
          <input className={input} name="edad_max" type="number" min={0} max={100} defaultValue={p?.edad_max ?? ""} placeholder="22" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([["canto", "Canto"], ["baile", "Baile"], ["actuacion", "Actuación"]] as const).map(([k, l]) => (
          <label key={k} className={etiqueta}>{l}
            <select className={input} name={k} defaultValue={p?.[k] ?? ""} onChange={k === "canto" ? (e) => setCanto(e.target.value) : undefined}>
              <option value="">Sin especificar</option>
              {NIVELES.map((n) => <option key={n.valor} value={n.valor}>{n.valor === "no" ? (k === "canto" ? "No canta" : k === "baile" ? "No baila" : "No") : n.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {canto !== "no" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Tesitura <span className="font-normal text-texto-3">(puedes marcar varias)</span></legend>
          <div className="flex flex-wrap gap-2">
            {TESITURAS.map((t) => (
              <label key={t.valor} className={chip}><input type="checkbox" name="tesitura" value={t.valor} defaultChecked={p?.tesituras?.includes(t.valor)} className="sr-only" />{t.label}</label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Habilidades especiales</legend>
        <div className="flex flex-wrap gap-2">
          {HABILIDADES.map((h) => (
            <label key={h} className={chip}><input type="checkbox" name="habilidad" value={h} defaultChecked={p?.habilidades?.includes(h)} className="sr-only" />{h}</label>
          ))}
        </div>
        <input className={`${input} text-sm`} name="habilidad_otra" defaultValue={otras} placeholder="Otra (separa con comas): ej. Zancos, Lengua de señas" />
      </fieldset>
      <label className={etiqueta}>Rasgos o notas
        <input className={input} name="rasgos" maxLength={500} defaultValue={p?.rasgos ?? ""} placeholder="Ej. Pelirroja · Debe verse más alto que Brady" />
      </label>
      {canciones.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Canciones donde canta</legend>
          <div className="flex flex-wrap gap-2">
            {canciones.map((c) => (
              <label key={c.id} className={chip}><input type="checkbox" name="cancion" value={c.id} defaultChecked={p?.canciones?.includes(c.id)} className="sr-only" />{c.titulo}</label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
