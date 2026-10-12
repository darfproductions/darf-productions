/* eslint-disable @next/next/no-img-element -- fotos privadas con URL firmada */
import { cuandoCumple, cumpleAnios, type Cumple } from "@/lib/account-rules";

// Lista de cumpleaños (0051): día, nombre, cuándo y, si se conoce el año, cuántos cumple.
export function BirthdayList({ items, fotos, vacio = "Nadie cumple años este mes." }: { items: Cumple[]; fotos?: Map<string, string>; vacio?: string }) {
  if (!items.length) return <p className="text-sm text-texto-3">{vacio}</p>;
  return (
    <ul className="flex flex-col divide-y divide-white/10 text-sm">
      {items.map((c) => {
        const cuando = cuandoCumple(c);
        const anios = cumpleAnios(c.nacimiento);
        const foto = c.foto_path ? fotos?.get(c.foto_path) : undefined;
        return (
          <li key={c.user_id} className="flex items-center gap-3 py-2">
            <span className="w-8 text-center text-lg font-black">{c.dia}</span>
            {fotos && (
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-telon-2 text-xs font-bold">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : c.nombre.slice(0, 1)}
              </span>
            )}
            <span className="flex-1">
              <b>{c.nombre}</b>{anios !== null && <span className="text-texto-3"> · cumple {anios}</span>}
            </span>
            {cuando && <span className={`text-xs font-bold ${cuando === "¡Hoy!" ? "text-[#fde68a]" : "text-texto-3"}`}>{cuando}</span>}
          </li>
        );
      })}
    </ul>
  );
}
