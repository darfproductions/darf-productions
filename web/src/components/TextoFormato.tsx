import { partesFormato } from "@/lib/texto-formato";

// Muestra un texto del equipo con **negritas**, __subrayado__ y *cursivas* (ver texto-formato.ts). Respeta los saltos de
// línea. Nunca interpreta HTML.
export function TextoFormato({ texto, className = "", as: Tag = "p" }: { texto: string; className?: string; as?: "p" | "div" | "span" }) {
  return (
    <Tag className={`whitespace-pre-line ${className}`}>
      {partesFormato(texto).map((p, i) => {
        const clases = [p.negrita && "font-bold", p.subrayado && "underline decoration-2 underline-offset-4", p.cursiva && "italic"].filter(Boolean).join(" ");
        return clases ? <span key={i} className={clases}>{p.texto}</span> : <span key={i}>{p.texto}</span>;
      })}
    </Tag>
  );
}
