import type { Metadata } from "next";
import Link from "next/link";
import { Card, EstadoChip } from "@/components/panel/ui";
import { kitMissing } from "@/lib/themes";
import { Icono } from "@/components/Icono";
import { AnclaVieja } from "./AnclaVieja";
import { CambiosPanel } from "./CambiosPanel";
import { EstadoPanel } from "./EstadoPanel";
import { Block, cargarEditor } from "./editor";

export const metadata: Metadata = { title: "Página pública" };

// Página pública → Publicar: estado, cambios sin publicar y a dónde ir para editar cada parte. Lo que se edita vive
// en Contenido, Imagen y Avisos; la venta y los precios, en Boletos → Preparar → Funciones y horarios.
export default async function PageEditor({ params }: PageProps<"/panel/producciones/[id]/pagina">) {
  const { id } = await params;
  const { editar, publicar, p, data, cambios, cambio } = await cargarEditor(id, "pagina", false);
  const faltan = kitMissing(p);
  const publica = ["publicada", "archivada"].includes(data.production.estado);
  const base = `/panel/producciones/${id}`;
  const partes = [
    { href: "pagina/contenido", titulo: "Contenido", que: "Datos y ficha, sinopsis, canciones, videos y agradecimientos.", c: cambio("datos", "canciones", "ficha", "videos", "gracias") },
    { href: "pagina/imagen", titulo: "Imagen y pósters", que: "Logo, imagen de ambiente, póster oficial y alterno, colores.", c: cambio("kit", "colores", "poster") },
    { href: "pagina/avisos", titulo: "Avisos", que: "Franja de avisos y anuncios con cuenta regresiva.", c: cambio("franja") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AnclaVieja base={`${base}/pagina`} />
      <Block id="estado" abierto title="Estado y publicación" note="El público solo ve obras publicadas o archivadas. Nada se borra al ocultar, archivar o cancelar.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-texto-2">Estado actual:</span><EstadoChip estado={p.estado} />
          <Link href={`/vista-previa/${id}`} target="_blank" className="ml-auto rounded-full bg-texto px-3 py-1.5 text-sm font-bold text-sala">Vista previa <Icono nombre="externo" /></Link>
        </div>
        {faltan.length > 0 ? (
          <div className="rounded-lg bg-sala p-3 text-sm">
            <p className="font-bold text-aviso">Para publicar falta:</p>
            <ul className="mt-1 text-texto-2">{faltan.map((f) => <li key={f}><Icono nombre="punto" className="h-2 w-2 opacity-70" /> {f}</li>)}</ul>
            {editar && <Link href={`${base}/pagina/imagen`} className="mt-2 inline-block font-bold text-violeta-claro">Completar en Imagen y pósters</Link>}
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#bbf7d0]">El kit está completo.</p>
        )}
        {publicar ? <EstadoPanel pid={id} estado={p.estado} onSale={p.on_sale} /> : <p className="text-sm text-texto-3">Publicar o archivar lo hace la Dirección de la obra o el Director.</p>}
      </Block>

      {(publica || cambios.length > 0) && <CambiosPanel pid={id} cambios={cambios} publicar={publicar} />}

      {editar && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Editar la página</h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {partes.map((x) => (
              <li key={x.href}>
                <Link href={`${base}/${x.href}`} className="flex h-full flex-col gap-1 rounded-xl bg-telon-2 p-4 hover:bg-white/10">
                  <span className="flex items-center justify-between gap-2 font-bold">{x.titulo}<Icono nombre="flecha-der" /></span>
                  <span className="text-sm text-texto-2">{x.que}</span>
                  {x.c && <span className="text-xs font-bold text-aviso">{x.c === "borrador" ? "Borrador sin publicar" : "Solo lo ven los fans"}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-sm text-texto-3">
        La venta y los precios (publicar funciones, modo de venta, mostrar precios) están en{" "}
        <Link href={`${base}/boletos/funciones`} className="font-bold text-violeta-claro">Boletos <Icono nombre="flecha-der" /> Preparar <Icono nombre="flecha-der" /> Funciones y horarios</Link>.
      </p>
    </div>
  );
}
