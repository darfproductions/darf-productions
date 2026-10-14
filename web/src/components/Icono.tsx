// Íconos propios de DARF (Diego 2026-10-14: "nada de emojis"). Trazo de 1.8 con puntas redondas, en
// el color del texto (currentColor) y del tamaño de la letra (1em) salvo que se pida otro con className.
// Decorativos por omisión (aria-hidden); con `etiqueta` se anuncian a lectores de pantalla.

export type IconoNombre =
  | "flecha-der" | "flecha-izq" | "flecha-abajo" | "flecha-arriba" | "externo" | "intercambio" | "deshacer"
  | "check" | "x" | "chevron-abajo" | "alerta" | "punto" | "circulo"
  | "engrane" | "candado" | "boleto" | "sobre" | "play" | "pausa" | "mascaras" | "claqueta" | "camara"
  | "credencial" | "megafono" | "celular" | "telefono" | "tarjeta" | "documento" | "contrato" | "reloj"
  | "destello" | "foco" | "estrella" | "estrella-vacia" | "calendario" | "lupa" | "personas" | "lapiz"
  | "campana" | "imagen" | "descargar" | "compartir" | "lista";

const RELLENO = { fill: "currentColor", stroke: "none" } as const;

const TRAZOS: Record<IconoNombre, React.ReactNode> = {
  "flecha-der": <path d="M5 12h14M13 6l6 6-6 6" />,
  "flecha-izq": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "flecha-abajo": <path d="M12 5v14M6 13l6 6 6-6" />,
  "flecha-arriba": <path d="M12 19V5M6 11l6-6 6 6" />,
  externo: <path d="M7 17L17 7M9 7h8v8" />,
  intercambio: <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />,
  deshacer: <path d="M9 6L4 11l5 5M4 11h10a5 5 0 0 1 0 10h-2" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-abajo": <path d="M6 9l6 6 6-6" />,
  alerta: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.4v.1" /></>,
  punto: <circle cx="12" cy="12" r="4.5" {...RELLENO} />,
  circulo: <circle cx="12" cy="12" r="7" />,
  engrane: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
      <circle cx="12" cy="12" r="6.5" />
    </>
  ),
  candado: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  boleto: (
    <>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14.5 7v1.5M14.5 11.25v1.5M14.5 15.5V17" />
    </>
  ),
  sobre: <><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M4 7l8 6 8-6" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" {...RELLENO} />,
  pausa: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" {...RELLENO} />,
  mascaras: (
    <>
      <path d="M5 5h14v6a7 7 0 0 1-14 0z" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" />
      <path d="M9.5 13.5c1.5 1.3 3.5 1.3 5 0" />
    </>
  ),
  claqueta: <><rect x="3.5" y="9" width="17" height="11" rx="1.5" /><path d="M3.5 9l1.6-4h14.4l-1.6 4M9.5 5l-1.6 4M15 5l-1.6 4" /></>,
  camara: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  credencial: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <circle cx="8.5" cy="10.5" r="2" />
      <path d="M5.5 15.5c.6-1.5 1.7-2.3 3-2.3s2.4.8 3 2.3M14 10h4M14 13.5h4" />
    </>
  ),
  megafono: <path d="M4 10v4h3l7 4V6l-7 4zM17 9.5a3.5 3.5 0 0 1 0 5M7 14l1 5h2l-1-5" />,
  celular: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>,
  telefono: <path d="M5 4.5h3.2l1.6 4-2 1.3a10 10 0 0 0 4.4 4.4l1.3-2 4 1.6V17A1.5 1.5 0 0 1 16 18.5 13.5 13.5 0 0 1 3.5 6 1.5 1.5 0 0 1 5 4.5z" />,
  tarjeta: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  documento: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h5M9.5 15.5h5" />,
  contrato: <path d="M6 3.5h9l3 3v14H6zM9 9h6M9 12h6M9 15h3M14 17.5l1.2 1 2-2.5" />,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  destello: <path d="M12 3l1.9 5.6a3 3 0 0 0 1.9 1.9L21 12l-5.2 1.5a3 3 0 0 0-1.9 1.9L12 21l-1.9-5.6a3 3 0 0 0-1.9-1.9L3 12l5.2-1.5a3 3 0 0 0 1.9-1.9z" {...RELLENO} />,
  foco: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />,
  estrella: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" {...RELLENO} />,
  "estrella-vacia": <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />,
  calendario: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" /></>,
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  personas: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M15.5 14.6c2.3-.2 4.2 1.2 5 4.4" />
    </>
  ),
  lapiz: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
  campana: <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />,
  imagen: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 17l5-5 4 4 2.5-2.5 4.5 4.5" /></>,
  descargar: <path d="M12 4v11M7 10l5 5 5-5M5 19.5h14" />,
  lista: <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3.5h6v1M8.5 10l1.2 1.2 2.3-2.4M13.5 10.2H16M8.5 15l1.2 1.2 2.3-2.4M13.5 15.2H16" /></>,
  compartir: <path d="M12 15V4M8 8l4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />,
};

export function Icono({ nombre, className = "", etiqueta }: { nombre: IconoNombre; className?: string; etiqueta?: string }) {
  // Tamaño propio (h-5, size-6…) o, si no, el de la letra.
  const tam = /(^|\s)(h|size)-/.test(className) ? "" : "h-[1em] w-[1em]";
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.125em] ${tam} ${className}`}
      {...(etiqueta ? { role: "img", "aria-label": etiqueta } : { "aria-hidden": true })}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
