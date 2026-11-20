import { opcionesMes } from "@/lib/mes-select-rules";

/** Desplegable de mes y año (manda "AAAA-MM", igual que <input type="month">, que Safari no muestra bien). */
export function MesSelect({ name, defaultValue, required, className, antes = 1, despues = 3, vacio, ...rest }: {
  name: string; defaultValue?: string | null; required?: boolean; className?: string; antes?: number; despues?: number; vacio?: string;
  "aria-label"?: string; title?: string;
}) {
  const anio = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).slice(0, 4));
  const valor = defaultValue?.slice(0, 7) ?? "";
  return (
    <select name={name} defaultValue={valor} required={required} className={className} {...rest}>
      <option value="">{vacio ?? (required ? "Elige el mes" : "—")}</option>
      {opcionesMes(anio, antes, despues, valor).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
