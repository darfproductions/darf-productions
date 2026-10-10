import Image from "next/image";
import Link from "next/link";
import { formatPrice, getHomeData, getTheme } from "@/lib/productions";

// Portada: habla con la voz de DARF; la obra destacada es invitada.
// Destacada = la obra en cartelera; si no hay, la más reciente del archivo.
export default async function Home() {
  const { productions, featured } = await getHomeData();
  const current = featured?.production ?? null;
  const enCartelera = featured?.mode === "cartelera";
  const currentTheme = current ? getTheme(current.id) : null;

  return (
    <main className="relative overflow-hidden pb-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-52 -top-[22rem] h-[70rem] w-[56rem] -rotate-[18deg] bg-[radial-gradient(ellipse_at_30%_20%,rgb(68_14_213/0.55),transparent_60%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-56 -top-[22rem] h-[70rem] w-[56rem] rotate-[18deg] bg-[radial-gradient(ellipse_at_70%_20%,rgb(188_3_63/0.45),transparent_60%)]" />

      <section id="cartelera" className="relative mx-auto grid max-w-[1440px] gap-10 px-5 pt-8 md:grid-cols-12 md:gap-6 md:px-16 md:pt-16">
        <div className="flex flex-col gap-6 md:col-span-6 md:pt-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-texto-3">
            DARF Productions · Teatro musical
          </p>
          <h1 className="titular text-5xl md:text-[84px]">Teatro con luz propia</h1>
          <p className="max-w-xl text-lg leading-relaxed text-texto-2">
            Producciones, funciones y comunidad en un solo lugar. Descubre lo que
            está en cartelera, revive el archivo y sé parte del elenco.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="#producciones" className="rounded-full bg-texto px-7 py-4 text-sm font-bold uppercase tracking-[0.1em] text-sala">
              Ver producciones
            </Link>
            <Link href="#fan-zone" className="rounded-full border border-texto/50 px-7 py-4 text-sm font-bold uppercase tracking-[0.1em]">
              Únete a la Fan Zone
            </Link>
          </div>
        </div>

        {current && (
          <article className="self-start overflow-hidden rounded-2xl shadow-[0_30px_80px_rgb(68_14_213/0.35)] md:col-span-5 md:col-start-8" style={{ background: currentTheme?.superficie }}>
            <div className="relative aspect-[16/10]">
              {currentTheme && (
                <Image src={currentTheme.hero} alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" priority />
              )}
              {currentTheme?.titulo ? (
                <Image src={currentTheme.titulo} alt={current.nombre} className="absolute inset-x-[12%] top-[34%] w-[76%]" sizes="40vw" />
              ) : (
                <h2 className="titular absolute inset-x-6 bottom-6 text-4xl">{current.nombre}</h2>
              )}
              <span className="absolute left-4 top-4 rounded-full bg-texto px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-sala">
                {enCartelera ? "Ahora en cartelera" : "Lo último que presentamos"}
              </span>
            </div>
            <div className="flex flex-col gap-4 p-6">
              <ul className="flex flex-wrap gap-2 text-xs font-semibold" style={{ color: currentTheme?.texto }}>
                {current.venue && <li className="rounded-full border border-white/25 px-3 py-1.5">{current.venue}</li>}
                {enCartelera && current.price > 0 && <li className="rounded-full border border-white/25 px-3 py-1.5">Desde {formatPrice(current.price)}</li>}
                {!enCartelera && <li className="rounded-full border border-white/25 px-3 py-1.5">Archivo</li>}
              </ul>
              {enCartelera ? (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/producciones/${current.id}`} className="boton-compra flex-1 rounded-full py-4 text-center text-[13px] font-bold uppercase tracking-[0.1em]">
                    Comprar boletos
                  </Link>
                  <Link href={`/producciones/${current.id}`} className="rounded-full border px-5 py-4 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: currentTheme?.acento, color: currentTheme?.texto }}>
                    Conocer la obra
                  </Link>
                </div>
              ) : (
                <Link href={`/producciones/${current.id}`} className="rounded-full border py-4 text-center text-[13px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: currentTheme?.acento, color: currentTheme?.texto }}>
                  Revivir la obra
                </Link>
              )}
            </div>
          </article>
        )}
      </section>

      <section id="producciones" className="relative mx-auto mt-20 flex max-w-[1440px] flex-col gap-6 px-5 md:px-16">
        <h2 className="titular text-3xl md:text-4xl">Producciones</h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {productions.map((p) => {
            const t = getTheme(p.id);
            return (
              <li key={p.id}>
                <Link href={`/producciones/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon">
                  <div className="relative aspect-[16/9]" style={{ background: t?.fondo }}>
                    {t && <Image src={t.hero} alt="" fill sizes="(min-width: 768px) 30vw, 100vw" className="object-cover" />}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <span className="text-lg font-bold">{p.nombre}</span>
                    <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: p.concluded ? "var(--texto-3)" : t?.acento }}>
                      {p.concluded ? "Archivo" : "En cartelera"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="relative mx-auto mt-8 grid max-w-[1440px] gap-5 px-5 md:grid-cols-2 md:px-16">
        <div id="fan-zone" className="flex min-h-56 flex-col gap-3 rounded-2xl bg-[linear-gradient(125deg,#440ed5,#810888_60%,#bc033f)] p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/85">Fan Zone</p>
          <h2 className="titular text-3xl">Detrás del telón</h2>
          <p className="max-w-md text-white/90">Ensayos, videos y galerías de cada producción.</p>
        </div>
        <div id="audiciones" className="flex min-h-56 flex-col gap-3 rounded-2xl bg-telon p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-texto-3">Audiciones</p>
          <h2 className="titular text-3xl">Únete al elenco</h2>
          <p className="max-w-md text-texto-2">No hay convocatorias abiertas en este momento.</p>
        </div>
      </section>
    </main>
  );
}
