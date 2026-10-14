/* eslint-disable @next/next/no-img-element -- la medalla es un PNG generado */
import { medallaSrc, NIVELES_LEALTAD, nivelDe, siguienteMeta } from "@/lib/lealtad-rules";

// DARF Loyalty en Mi cuenta (0103): aparece con la primera producción. Muestra la medalla (si ya
// la tiene), cuántas producciones lleva y la barra hacia la siguiente meta (Diego 2026-10-14).
export function BarraLealtad({ n }: { n: number }) {
  if (n < 1) return null;
  const nivel = nivelDe(n);
  const meta = siguienteMeta(n);
  const siguiente = meta?.nivel ?? null;
  const pct = Math.round((meta ? meta.progreso : 1) * 100);
  const color = (nivel ?? siguiente ?? NIVELES_LEALTAD[0]).colores[1];
  return (
    <section aria-labelledby="lealtad" className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
      <div className="flex items-center gap-4">
        <img src={medallaSrc(nivel ? n : NIVELES_LEALTAD[0].min)} alt={nivel ? `Medalla ${nivel.nombre}` : "Medalla Rookie (bloqueada)"}
          className={`h-16 w-16 shrink-0 ${nivel ? "" : "opacity-40 grayscale"}`} />
        <div className="flex flex-col gap-0.5">
          <h2 id="lealtad" className="text-lg font-bold">DARF Loyalty</h2>
          <p className="text-sm text-texto-2">
            {nivel ? <><b className="text-texto">{nivel.nombre}</b> · {nivel.piedra}</> : "Tu camino empieza"} · {n} {n === 1 ? "producción" : "producciones"}
          </p>
        </div>
      </div>
      <div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label={siguiente ? `Avance hacia ${siguiente.nombre}` : "Nivel máximo"}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: `linear-gradient(90deg, ${color}, ${(siguiente ?? nivel)!.colores[1]})` }} />
        </div>
        <p className="mt-2 text-sm text-texto-2">
          {siguiente && meta
            ? <>Siguiente meta: <b className="text-texto">{siguiente.nombre}</b> ({siguiente.piedra}) en {siguiente.min} · te {meta.faltan === 1 ? "falta 1 producción" : `faltan ${meta.faltan} producciones`}</>
            : <>Llegaste a la cima: <b className="text-texto">Hall of Fame</b>. Gracias por tanto.</>}
        </p>
      </div>
    </section>
  );
}
