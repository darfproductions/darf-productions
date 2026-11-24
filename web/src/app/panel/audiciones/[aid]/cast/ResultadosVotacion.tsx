// Resultados de la votación (0167), por personaje: cuántos votos tuvo cada quien, sus «Opción 1» de los jueces,
// su promedio, las abstenciones, qué votó cada juez, quién está hoy en el cast y la nota de la propuesta
// (empate o segundo lugar). Para la junta: lo ven la dirección y los jueces, ya cerrada la votación.

export type Resultados = {
  fase: string; jueces: number;
  roles: {
    id: string; personaje: string; nota: string | null; abstenciones: number; quedo: string[];
    ranking: { id: string; nombre: string; numero: number | null; votos: number; op1: number; prom: number | null }[];
    por_juez: { juez: string; voto: string | null }[];
  }[];
};

const c = "border-b border-white/10 px-2 py-1.5 text-left align-top";

export function ResultadosVotacion({ r }: { r: Resultados }) {
  return (
    <section aria-label="Resultados de la votación" className="flex flex-col gap-3">
      <div>
        <h2 className="titular text-xl">Resultados de la votación</h2>
        <p className="text-sm text-texto-2">Votaron {r.jueces} {r.jueces === 1 ? "juez" : "jueces"}. Por personaje, del más votado al menos; los empates se desempatan con las «Opción 1» de los jueces y luego con el promedio.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {r.roles.map((p) => {
          const max = p.ranking[0]?.votos ?? 0;
          return (
            <article key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-telon p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-black">{p.personaje}</h3>
                <span className="text-xs text-texto-3">{p.quedo.length ? `En el cast: ${p.quedo.join(", ")}` : "Sin nadie en el cast"}</span>
              </div>
              {p.nota && <p className="rounded-lg bg-aviso/10 px-2 py-1.5 text-xs text-aviso">{p.nota}</p>}
              {p.ranking.length === 0 ? <p className="text-sm text-texto-3">Nadie votó por alguien en este personaje{p.abstenciones ? ` (${p.abstenciones} ${p.abstenciones === 1 ? "abstención" : "abstenciones"})` : ""}.</p> : (
                <table className="w-full border-collapse text-sm">
                  <thead className="text-xs text-texto-3">
                    <tr><th className={c}>Aspirante</th><th className={c}>Votos</th><th className={c}>Opción 1</th><th className={c}>Promedio</th></tr>
                  </thead>
                  <tbody>
                    {p.ranking.map((k) => (
                      <tr key={k.id} className={k.votos === max ? "font-bold" : ""}>
                        <td className={c}>{k.numero ? `Nº ${k.numero} · ` : ""}{k.nombre}{k.votos === max && p.ranking.filter((x) => x.votos === max).length > 1 ? <span className="ml-1 rounded-full bg-aviso/15 px-1.5 text-[10px] text-aviso">empate</span> : null}</td>
                        <td className={c}>
                          <span className="flex items-center gap-2">{k.votos}
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden="true"><span className="block h-full rounded-full bg-lila" style={{ width: `${(k.votos / Math.max(1, max)) * 100}%` }} /></span>
                          </span>
                        </td>
                        <td className={c}>{k.op1 || "—"}</td>
                        <td className={c}>{k.prom ?? "—"}</td>
                      </tr>
                    ))}
                    {p.abstenciones > 0 && <tr><td className={`${c} italic text-texto-3`}>Abstenciones</td><td className={c}>{p.abstenciones}</td><td className={c} /><td className={c} /></tr>}
                  </tbody>
                </table>
              )}
              {p.por_juez.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-bold text-violeta-claro">Qué votó cada juez</summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {p.por_juez.map((j, i) => <li key={i}><b>{j.juez}:</b> {j.voto ?? <i className="text-texto-3">se abstuvo</i>}</li>)}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
