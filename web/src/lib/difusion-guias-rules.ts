// Diseños generales de difusión (DARF, no de una obra): guías paso a paso para redes.
// Funciones puras: difusion-guias-rules.test.ts. El dibujo está en difusion-guias.tsx.

export type TipoGuia = "club" | "cuenta";

export type Guia = {
  id: TipoGuia;
  label: string;
  ayuda: string;
  /** Línea chica arriba (acento). */
  arriba: string;
  /** Título grande; lo que va entre * * sale en el color del acento (oro en el Club Fan). */
  titulo: string;
  pasos: string[];
  /** Renglón de beneficios abajo de los pasos. */
  extra: string;
  /** Liga a la que lleva el QR (ruta del sitio). */
  ruta: string;
  oro: boolean;
};

export const GUIAS: Guia[] = [
  {
    id: "club",
    label: "Cómo unirte al Club Fan",
    ayuda: "Los pasos para hacerse socio, con QR a la página del Club Fan.",
    arriba: "Gratis · en un minuto",
    titulo: "Únete al\n*Club Fan*",
    pasos: [
      "Entra a darfproductions.com/club-fan o escanea el QR",
      "Crea tu cuenta o entra con Google",
      "Toca «Unirme al Club Fan · gratis»",
      "¡Listo! Tu credencial de socio está en Mi cuenta",
    ],
    extra: "Preventas · Ensayos y making of · Foto con el elenco · Eventos del club",
    ruta: "/club-fan",
    oro: true,
  },
  {
    id: "cuenta",
    label: "Cómo crear tu cuenta",
    ayuda: "Los pasos para abrir una cuenta DARF, con QR a la página para entrar.",
    arriba: "Tus boletos siempre a la mano",
    titulo: "Crea tu\n*cuenta DARF*",
    pasos: [
      "Entra a darfproductions.com/entrar o escanea el QR",
      "Toca «Crear cuenta» o «Continuar con Google»",
      "Escribe tu nombre, tu correo y una contraseña",
      "Confirma tu correo y ¡listo!",
    ],
    extra: "Compra boletos · Guárdalos en tu celular · Audiciones · Club Fan",
    ruta: "/entrar",
    oro: false,
  },
];

export function guiaValida(v: unknown): Guia | null {
  return GUIAS.find((g) => g.id === v) ?? null;
}

/** Partes del título: [texto, resaltado] por renglón ("*" marca lo resaltado). */
export function partesTitulo(titulo: string): { texto: string; resaltado: boolean }[][] {
  return titulo.split("\n").map((r) => r.split(/(\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith("*") ? { texto: t.slice(1, -1), resaltado: true } : { texto: t, resaltado: false })));
}
