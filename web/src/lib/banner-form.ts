import { enlaceValido, esColor, type BannerEstilo } from "@/lib/banner-rules";
import { localMxToIso } from "@/lib/dates";

// Lee y revisa el formulario de una franja (de una obra, 0069, o del sitio, 0074).
export type FranjaItem = { texto: string; enlace: string; boton: string; inicia: string | null; termina: string | null };

export function leerFranja(f: FormData): { ok: true; estilo: BannerEstilo; color: string; items: FranjaItem[] } | { ok: false; message: string } {
  const estilo: BannerEstilo = String(f.get("estilo")) === "fija" ? "fija" : "corre";
  const color = f.get("usar_color") ? String(f.get("color") ?? "") : "";
  if (color && !esColor(color)) return { ok: false, message: "El color no es válido." };
  const col = (k: string) => f.getAll(k).map((v) => String(v).trim());
  const [textos, enlaces, botones, inicios, fines] = [col("texto"), col("enlace"), col("boton"), col("inicia"), col("termina")];
  const items: FranjaItem[] = [];
  for (let i = 0; i < textos.length; i++) {
    const n = i + 1;
    if (!textos[i]) {
      if (enlaces[i] || botones[i]) return { ok: false, message: `Al aviso ${n} le falta el texto.` };
      continue;
    }
    if (textos[i].length > 160) return { ok: false, message: `El aviso ${n} es muy largo (máximo 160 letras).` };
    let enlace = enlaces[i] ?? "";
    if (enlace && !enlace.startsWith("/") && !enlace.includes("://")) enlace = `https://${enlace}`;
    if (enlace && !enlaceValido(enlace)) return { ok: false, message: `La liga del aviso ${n} no es válida. Usa una dirección que empiece con https:// o con / (por ejemplo /audiciones).` };
    const inicia = inicios[i] ? localMxToIso(inicios[i]) : null;
    const termina = fines[i] ? localMxToIso(fines[i]) : null;
    if (inicia && termina && termina <= inicia) return { ok: false, message: `En el aviso ${n}, la fecha de fin debe ser después de la de inicio.` };
    items.push({ texto: textos[i], enlace, boton: (botones[i] ?? "").slice(0, 30), inicia, termina });
  }
  if (items.length > 10) return { ok: false, message: "Máximo 10 avisos en la franja." };
  return { ok: true, estilo, color, items };
}
