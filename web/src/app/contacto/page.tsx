import type { Metadata } from "next";
import { PageHeading } from "@/components/PageHeading";
import { SocialIcon } from "@/components/SocialIcon";
import { CONTACT_CHANNELS, WHATSAPP_DISPLAY, type ContactChannel } from "@/content/contacto";
import { env } from "@/lib/env";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contacto" };

function ChannelCard({ c, disabledNote }: { c: ContactChannel; disabledNote?: string }) {
  const inner = (
    <>
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: `color-mix(in srgb, ${c.color} 18%, transparent)`, color: c.color }}
      >
        <SocialIcon channel={c.channel} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-lg font-bold">{c.nombre}</span>
        <span className="truncate font-semibold" style={{ color: c.color }}>{c.handle}</span>
        <span className="text-sm text-texto-3">{disabledNote ?? c.descripcion}</span>
      </span>
      <span aria-hidden="true" className="ml-auto text-2xl text-texto-3 transition-transform group-hover:translate-x-1 group-hover:text-white">→</span>
    </>
  );
  const cls = "group flex items-center gap-4 rounded-2xl border border-white/10 bg-telon p-5 transition-all";
  return c.href ? (
    <a
      href={c.href}
      className={`${cls} hover:-translate-y-0.5 hover:border-white/25`}
      {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inner}
    </a>
  ) : (
    <div className={`${cls} opacity-70`}>{inner}</div>
  );
}

export default function ContactoPage() {
  const whatsapp: ContactChannel = {
    channel: "whatsapp",
    nombre: "WhatsApp",
    handle: WHATSAPP_DISPLAY,
    descripcion: "Atención directa y pagos de boletos",
    href: env.whatsapp ? `https://wa.me/${env.whatsapp}` : "",
    color: "#25d366",
  };

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Contacto" title="Hablemos">
        Escríbenos por el canal que prefieras: dudas de boletos, prensa, patrocinios o colaboraciones.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 md:px-16">
        <section aria-labelledby="canales" className="flex flex-col gap-5">
          <h2 id="canales" className="titular text-2xl">Síguenos y escríbenos</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[whatsapp, ...CONTACT_CHANNELS].map((c) => (
              <li key={c.channel}>
                <ChannelCard c={c} disabledNote={c.href ? undefined : "En el entorno de pruebas el enlace está desactivado"} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="mensaje" className="grid gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-3 lg:col-span-4">
            <h2 id="mensaje" className="titular text-2xl">Envíanos un mensaje</h2>
            <p className="text-texto-2">Te respondemos por correo. Para temas de boletos, incluye tu código de orden si ya la tienes.</p>
          </div>
          <div className="lg:col-span-8"><ContactForm /></div>
        </section>
      </div>
    </main>
  );
}
