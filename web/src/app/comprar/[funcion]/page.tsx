import { listarBeneficios } from "@/lib/beneficios";
import { porZona, type Beneficio } from "@/lib/beneficios-rules";
import type { Metadata } from "next";
import { leerDiseno } from "@/lib/mapa-libre";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { PasosBarra, PasosProvider } from "@/components/PasosCompra";
import { UnirseClub } from "@/components/fanzone/UnirseClub";
import { enPreventa, partesFuncion, ventaPorAbrir } from "@/lib/disponibilidad";
import { getPromos } from "@/lib/promos";
import { conPromo, mejorPromo, pctZona } from "@/lib/promo-rules";
import { getCredencial } from "@/lib/fanzone";
import { getSession } from "@/lib/auth";
import { formatPerformanceDate, getPerformanceForSale, getTheme, themeStyle } from "@/lib/productions";
import { cleanSellerCode } from "@/lib/seller-rules";
import { createClient } from "@/lib/supabase/server";
import type { MapSeat } from "@/lib/tickets";
import { generalAvailability } from "@/lib/boleteria";
import { funcionVendible, textosVenta } from "@/lib/ventas-rules";
import { GeneralPicker } from "./GeneralPicker";
import { SeatPicker, type ZonePrice } from "./SeatPicker";
import { mensajeError } from "@/lib/errores";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { asientosOcupados } from "@/lib/ocupados";
import { Icono } from "@/components/Icono";
import { env } from "@/lib/env";
import { whatsappPedirUrl } from "@/lib/tickets";

export async function generateMetadata({ params }: PageProps<"/comprar/[funcion]">): Promise<Metadata> {
  const data = await getPerformanceForSale((await params).funcion);
  return { title: textosVenta(data?.production.modo_venta).eyebrow };
}

export default async function ComprarPage({ params, searchParams }: PageProps<"/comprar/[funcion]">) {
  const { funcion } = await params;
  const vendedor = cleanSellerCode((await searchParams).v);
  // El mapa se ve sin cuenta; para apartar se pide entrar (Bloque 2).
  const sp = await searchParams;
  const session = await getSession();
  const inicial = typeof sp.asientos === "string" ? sp.asientos.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20) : [];
  const data = await getPerformanceForSale(funcion);
  if (!data) notFound();
  const { performance: f, production: p } = data;
  // 0120: funciones sin publicar no se venden en línea (ni se ven).
  if (p.funciones_publicadas === false) notFound();
  const porWhatsApp = p.modo_venta === "whatsapp";
  // 0120: "todo por WhatsApp" no tiene pantalla de compra: directo a WhatsApp.
  if (porWhatsApp && env.whatsapp) redirect(whatsappPedirUrl(env.whatsapp, p.nombre, formatPerformanceDate(f.starts_at)));
  const tv = textosVenta(p.modo_venta);
  // En híbrido no se habla de comprar: se aparta.
  const verbo = p.modo_venta === "hibrido" ? "apartar" : "comprar";
  const modo = p.modo_venta === "hibrido" ? "hibrido" as const : "web" as const;
  const mostrarTotal = p.mostrar_total !== false;
  const vendible = funcionVendible(f, p.concluded);
  const yaPaso = !!f.starts_at && !funcionVendible({ on_sale: true, starts_at: f.starts_at }, false);
  // Preventa del Club Fan (0076): quien no es socio puede unirse aquí mismo (la base lo exige igual).
  const preventa = vendible && enPreventa(f);
  const bloqueada = preventa && !(await getCredencial());
  const hasta = preventa && f.preventa_hasta ? partesFuncion(f.preventa_hasta) : null;
  // 0118: antes del inicio nadie compra en línea (la base lo exige igual).
  const abre = vendible && ventaPorAbrir(f) && f.preventa_desde ? partesFuncion(f.preventa_desde) : null;

  const supabase = await createClient();
  // Antes de mostrar el mapa se liberan los asientos de órdenes vencidas (0054).
  if (vendible && session) await supabase.rpc("expire_due_orders", { pid: p.id });
  const promos = vendible ? (await getPromos(p.id)).get(f.id) : undefined;
  const promo = mejorPromo(promos);
  const [seatsRes, takenRes, pricesRes, disenoRes] = vendible && !abre && !porWhatsApp
    ? await Promise.all([
        todasLasFilas((a, b) => supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active, pos_x, pos_y, section").eq("production_id", p.id).order("id").range(a, b)),
        asientosOcupados(supabase, f.id),
        supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre, cupo, color, orden)").eq("performance_id", f.id),
        // 0113: escenario del mapa libre.
        supabase.from("mapas_diseno").select("diseno").eq("production_id", p.id).maybeSingle(),
      ])
    : [null, null, null, null];
  const formas = leerDiseno(disenoRes?.data?.diseno)?.formas ?? [];

  const seats = ((seatsRes?.data ?? []) as (MapSeat & { is_active: boolean })[]).filter((s) => s.is_active);
  const taken = (takenRes?.data ?? []) as string[];
  // Zonas con asiento para el mapa; las de entrada general van aparte (0055).
  // 0122: lo que incluye cada zona en ESTA función.
  const benef = vendible && !abre && !porWhatsApp ? porZona(await listarBeneficios(p.id), f.id) : new Map<string, Beneficio[]>();
  const general = (vendible && !abre && !porWhatsApp ? await generalAvailability(f.id) : []).map((z) => {
    const pct = pctZona(promos, z.price_category_id);
    const conB = { ...z, beneficios: benef.get(z.price_category_id) ?? [] };
    return pct ? { ...conB, precio: conPromo(z.precio, pct), antes: z.precio } : conB;
  });
  const prices: ZonePrice[] = (pricesRes?.data ?? []).filter((r) => (r.price_categories as unknown as { cupo: number | null } | null)?.cupo == null).map((r) => ({
    categoryId: r.price_category_id as string,
    price: conPromo(Number(r.price), pctZona(promos, r.price_category_id as string)),
    ...(pctZona(promos, r.price_category_id as string) > 0 && { antes: Number(r.price) }),
    nombre: (r.price_categories as unknown as { nombre: string } | null)?.nombre ?? "",
    color: (r.price_categories as unknown as { color: string | null } | null)?.color ?? null,
    orden: (r.price_categories as unknown as { orden: number | null } | null)?.orden ?? 0,
    beneficios: benef.get(r.price_category_id as string) ?? [],
  }));
  // Link de vendedor: el código se revisa aquí para mostrar su nombre desde el inicio.
  const sellerRes = vendible && vendedor && session ? await supabase.rpc("preview_seller_code", { target_performance_id: f.id, target_code: vendedor }) : null;
  const sellerCheck = sellerRes && vendedor
    ? (sellerRes.error ? { ok: false, text: mensajeError(sellerRes.error), code: vendedor } : { ok: true, text: `Vendedor: ${sellerRes.data as string}`, code: vendedor })
    : null;
  const loadError = seatsRes?.error || takenRes?.error || pricesRes?.error;

  return (
    <main style={themeStyle(getTheme(p))} className="pb-10">
      <PageHeading eyebrow={`${tv.eyebrow} · ${p.nombre}`} title={modo === "hibrido" ? tv.titulo : prices.length === 0 && general.length > 0 ? "Elige tus boletos" : "Elige tus asientos"}>
        <span>{formatPerformanceDate(f.starts_at)}</span> · {f.venue ?? p.venue}
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {!vendible ? (
          <div className="rounded-2xl bg-telon p-8">
            <p className="text-lg">{yaPaso ? "Esta función ya pasó." : "Esta función no está a la venta en este momento."}</p>
            <Link href={`/producciones/${p.id}`} className="mt-4 inline-block font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Volver a la obra</Link>
          </div>
        ) : porWhatsApp ? (
          <div className="flex max-w-2xl flex-col items-start gap-4 rounded-2xl bg-telon p-8">
            <p className="text-2xl font-black uppercase tracking-[-0.02em]">Boletos por WhatsApp</p>
            <p className="text-texto-2">Los lugares de esta función se apartan por WhatsApp. Escríbenos y te ayudamos a elegirlos; al confirmar tu pago te llega tu boleto con QR.</p>
            <a href={whatsappPedirUrl(env.whatsapp, p.nombre, formatPerformanceDate(f.starts_at)) || "/contacto"} target="_blank" rel="noopener" className="fb fb-luz">Pedir boletos por WhatsApp</a>
            <Link href={`/producciones/${p.id}`} className="text-sm font-bold text-texto-3 hover:text-texto"><Icono nombre="flecha-izq" /> Volver a la obra</Link>
          </div>
        ) : abre ? (
          <div className="flex max-w-2xl flex-col items-start gap-4 rounded-2xl bg-telon p-8">
            <p className="text-2xl font-black uppercase tracking-[-0.02em]">{f.preventa_hasta ? <>La preventa del <span className="txt-oro">Club Fan</span> abre pronto</> : "La venta abre pronto"}</p>
            <p className="text-texto-2">
              {f.preventa_hasta ? `Los socios del Club Fan pueden ${verbo}` : `Puedes ${verbo}`} desde el {abre.dia} {abre.numero} {abre.mes}, {abre.hora}.
              {f.preventa_hasta && ` Únete gratis al Club Fan para ${verbo} antes que nadie.`}
            </p>
            {f.preventa_hasta && !(await getCredencial()) && (session ? <UnirseClub /> : (
              <Link href={`/entrar?next=${encodeURIComponent(`/comprar/${f.id}`)}`} className="fb fb-fz">Entra o crea tu cuenta para unirte</Link>
            ))}
            <Link href={`/producciones/${p.id}`} className="text-sm font-bold text-texto-3 hover:text-texto"><Icono nombre="flecha-izq" /> Volver a la obra</Link>
          </div>
        ) : bloqueada ? (
          <div className="flex max-w-2xl flex-col items-start gap-4 rounded-[22px] border border-oro/40 bg-[#120f17] p-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG del kit */}
            <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-8 w-auto" />
            <p className="text-2xl font-black uppercase tracking-[-0.02em]">Preventa para el <span className="txt-oro">Club Fan</span></p>
            <p className="text-texto-2">Esta función está en preventa{hasta ? ` hasta el ${hasta.dia} ${hasta.numero} ${hasta.mes}, ${hasta.hora}` : ""}. Únete gratis al Club Fan y {verbo === "apartar" ? "aparta" : "compra"} antes que nadie; después se abre para todos.</p>
            {session ? <UnirseClub /> : (
              <Link href={`/entrar?next=${encodeURIComponent(`/comprar/${f.id}`)}`} className="fb fb-fz">Entra o crea tu cuenta para unirte</Link>
            )}
            <Link href={`/producciones/${p.id}`} className="text-sm font-bold text-texto-3 hover:text-texto"><Icono nombre="flecha-izq" /> Volver a la obra</Link>
          </div>
        ) : loadError ? (
          <p role="alert" className="rounded-2xl bg-telon p-8">No se pudo cargar el mapa de asientos. Recarga la página.</p>
        ) : prices.length === 0 && general.length === 0 ? (
          <p className="rounded-2xl bg-telon p-8">Esta función aún no tiene precios disponibles. Intenta más tarde.</p>
        ) : (
          <PasosProvider>
          <div className="flex flex-col gap-10">
          <PasosBarra pasos={tv.pasos} />
          {promo && mostrarTotal && <p className="rounded-2xl border border-obra-acento/40 bg-telon p-4 font-semibold">Promo {promo.nombre}: {promo.percent}% de descuento ya aplicado{[...prices, ...general].some((z) => !("antes" in z) || z.antes == null) ? " en algunas zonas" : ""}.</p>}
          {general.length > 0 && (
            <GeneralPicker performanceId={f.id} productionName={p.nombre} zones={general} modo={modo} mostrarTotal={mostrarTotal}
              defaultPhone={session?.profile?.telefono ?? ""} defaultSeller={vendedor ?? ""} sinSesion={!session} />
          )}
          {prices.length > 0 && general.length > 0 && <h2 className="titular text-2xl">O elige asientos numerados</h2>}
          {prices.length > 0 && <SeatPicker
            modo={modo}
            mostrarTotal={mostrarTotal}
            formas={formas}
            performanceId={f.id}
            productionId={p.id}
            productionName={p.nombre}
            seats={seats}
            taken={taken}
            prices={prices}
            defaultPhone={session?.profile?.telefono ?? ""}
            defaultSeller={vendedor ?? ""}
            defaultSellerCheck={sellerCheck}
            sinSesion={!session}
            inicial={inicial}
          />}
          </div>
          </PasosProvider>
        )}
      </div>
    </main>
  );
}
