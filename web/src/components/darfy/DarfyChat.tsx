"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { contactoDarfy, preguntarDarfy, type DarfyContactState } from "@/lib/darfy-actions";
import { whatsappAskUrl, type Liga, type Respuesta } from "@/lib/darfy-rules";

type Mensaje = { id: number; de: "yo" | "darfy"; texto: string; ligas?: Liga[]; nose?: string };

const RAPIDAS = [
  { label: "Cartelera", q: "¿Qué obras hay en cartelera?" },
  { label: "Comprar boletos", q: "¿Cómo compro boletos?" },
  { label: "Pagos", q: "¿Cómo pago mis boletos?" },
  { label: "Audiciones", q: "¿Hay audiciones abiertas?" },
  { label: "Contacto", q: "¿Cómo los contacto?" },
];

const OCULTO_EN = ["/panel", "/comprar", "/vista-previa"];

// DARFY: burbuja de ayuda en las páginas públicas. Contesta con información pública; si no
// sabe, ofrece WhatsApp (con la pregunta ya escrita) o dejar los datos para que lo contacten.
export function DarfyChat({
  whatsapp,
  ask = preguntarDarfy,
  ocultoEn = OCULTO_EN,
}: {
  whatsapp: string;
  /** Quién contesta (por omisión, el servidor). */
  ask?: (pregunta: string) => Promise<Respuesta>;
  /** Rutas donde no aparece la burbuja. */
  ocultoEn?: string[];
}) {
  const pathname = usePathname() ?? "/";
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { id: 0, de: "darfy", texto: "¡Hola! Soy DARFY, el asistente de DARF Productions. ¿En qué te ayudo?" },
  ]);
  const [texto, setTexto] = useState("");
  const [formPara, setFormPara] = useState<string | null>(null);
  const [pensando, startPensar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const siguiente = useRef(1);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, formPara, pensando]);

  if (ocultoEn.some((p) => pathname.startsWith(p))) return null;

  const preguntar = (q: string) => {
    const pregunta = q.trim();
    if (!pregunta || pensando) return;
    setTexto("");
    setFormPara(null);
    setMensajes((m) => [...m, { id: siguiente.current++, de: "yo", texto: pregunta }]);
    startPensar(async () => {
      const r = await ask(pregunta);
      setMensajes((m) => [...m, { id: siguiente.current++, de: "darfy", texto: r.texto, ligas: r.ligas, nose: r.tipo === "nose" ? pregunta : undefined }]);
    });
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="boton-compra fixed bottom-12 right-4 z-40 flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold shadow-lg md:right-8"
        aria-label="Abrir el asistente DARFY"
      >
        <span aria-hidden="true" className="text-lg leading-none">✦</span> Pregúntale a DARFY
      </button>
    );
  }

  return (
    <section
      aria-label="DARFY, asistente de DARF Productions"
      className="fixed inset-x-2 bottom-10 z-40 flex max-h-[min(640px,calc(100dvh-5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-telon shadow-[0_30px_80px_rgb(0_0_0/0.6)] md:inset-x-auto md:right-8 md:w-[400px]"
    >
      <header className="flex items-center gap-3 bg-[linear-gradient(110deg,#440ed5,#810888_60%,#bc033f)] px-4 py-3">
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg">✦</span>
        <div className="flex-1">
          <p className="font-bold leading-tight">DARFY</p>
          <p className="text-xs text-white/85">Asistente de DARF Productions</p>
        </div>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-full px-3 py-1 text-xl leading-none hover:bg-white/15" aria-label="Cerrar">×</button>
      </header>

      <div ref={lista} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {mensajes.map((m) => (
          <div key={m.id} className={`flex flex-col gap-2 ${m.de === "yo" ? "items-end" : "items-start"}`}>
            <p className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.de === "yo" ? "rounded-br-sm bg-[#440ed5] text-white" : "rounded-bl-sm bg-telon-2 text-texto"}`}>
              {m.texto}
            </p>
            {!!m.ligas?.length && (
              <div className="flex max-w-[88%] flex-wrap gap-2">
                {m.ligas.map((l) => (
                  <Link key={l.href + l.label} href={l.href} onClick={() => setAbierto(false)} className="rounded-full border border-violeta-claro/50 px-3 py-1.5 text-xs font-bold text-violeta-claro hover:border-violeta-claro">
                    {l.label} →
                  </Link>
                ))}
              </div>
            )}
            {m.nose !== undefined && (
              <div className="flex max-w-[88%] flex-wrap gap-2">
                {whatsapp && (
                  <a href={whatsappAskUrl(whatsapp, m.nose)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-black">
                    Escríbenos por WhatsApp
                  </a>
                )}
                <button type="button" onClick={() => setFormPara(m.nose ?? "")} className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-bold hover:border-white/60">
                  Déjanos tus datos
                </button>
              </div>
            )}
          </div>
        ))}
        {pensando && <p className="self-start rounded-2xl rounded-bl-sm bg-telon-2 px-4 py-2.5 text-sm text-texto-3">DARFY está escribiendo…</p>}
        {formPara !== null && <DarfyContacto pregunta={formPara} onCerrar={() => setFormPara(null)} />}
        {mensajes.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {RAPIDAS.map((r) => (
              <button key={r.label} type="button" onClick={() => preguntar(r.q)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold hover:border-white/50">
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(texto);
        }}
        className="flex items-center gap-2 border-t border-white/10 bg-sala px-3 py-3"
      >
        <label htmlFor="darfy-q" className="sr-only">Tu pregunta</label>
        <input
          id="darfy-q"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          placeholder="Escribe tu pregunta…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-telon px-4 py-2.5 text-[16px] outline-none focus:border-violeta-claro md:text-sm"
        />
        <button disabled={!texto.trim() || pensando} className="rounded-full bg-texto px-4 py-2.5 text-sm font-bold text-sala disabled:opacity-50">
          Enviar
        </button>
      </form>
    </section>
  );
}

const campo = "w-full rounded-lg border border-white/10 bg-sala px-3 py-2 text-[16px] outline-none focus:border-violeta-claro md:text-sm";

function DarfyContacto({ pregunta, onCerrar }: { pregunta: string; onCerrar: () => void }) {
  const [state, enviar, enviando] = useActionState<DarfyContactState, FormData>(contactoDarfy, null);
  if (state?.ok) {
    return <p className="self-start rounded-2xl rounded-bl-sm bg-telon-2 px-4 py-2.5 text-sm">{state.message}</p>;
  }
  return (
    <form action={enviar} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-sala p-3 text-sm">
      <p className="font-bold">Te contactamos</p>
      <input type="hidden" name="pregunta" value={pregunta} />
      <input type="text" name="sitio" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input name="nombre" required maxLength={120} placeholder="Tu nombre" autoComplete="name" className={campo} />
      <input name="correo" type="email" required maxLength={200} placeholder="Tu correo" autoComplete="email" className={campo} />
      <input name="telefono" type="tel" maxLength={40} placeholder="Teléfono (opcional)" autoComplete="tel" className={campo} />
      <textarea name="mensaje" rows={2} maxLength={1500} placeholder="¿Algo más que debamos saber? (opcional)" className={campo} />
      <div className="flex items-center gap-2">
        <button disabled={enviando} className="rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala disabled:opacity-60">{enviando ? "Enviando…" : "Enviar"}</button>
        <button type="button" onClick={onCerrar} className="text-xs font-semibold text-texto-3">Cancelar</button>
      </div>
      {state && !state.ok && <p className="text-xs text-[#ff8fa3]">{state.message}</p>}
    </form>
  );
}
