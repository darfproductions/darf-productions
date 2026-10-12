/* eslint-disable @next/next/no-img-element -- logos y QR generados */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ActionForm } from "@/components/panel/ActionForm";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl } from "@/lib/productions";
import { getProgram } from "@/lib/program";
import { addSponsor, removeSponsor, saveProgram, setProgramPublished, setSponsorLogo } from "./actions";

export const metadata: Metadata = { title: "Programa" };

const check = (name: string, label: string, on: boolean) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" name={name} defaultChecked={on} /> {label}
  </label>
);

// Programa de mano digital: notas de dirección, mensaje, patrocinadores y el QR para la sala.
export default async function Programa({ params }: PageProps<"/panel/producciones/[id]/programa">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/programa`);
  if (!can(access, id, "programa.editar")) redirect(`/panel/producciones/${id}`);
  const { page, sponsors } = await getProgram(id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = `${proto}://${host}/programa/${id}`;
  const qr = await QRCode.toDataURL(link, { margin: 2, width: 600 });
  const publicado = !!page?.publicado;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Programa digital</h2>
        <p className="text-sm text-texto-2">
          Se llena solo con la obra (reparto, ensamble, canciones, equipos y agradecimientos de la Página pública). Aquí agregas
          las notas de dirección, un mensaje y los patrocinadores. El público lo ve solo si está publicado y la obra también.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-bold ${publicado ? "bg-green-500/20 text-green-300" : "bg-white/10 text-texto-2"}`}>
            {publicado ? "Publicado" : page ? "Oculto" : "Sin crear"}
          </span>
          <a href={`/programa/${id}`} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">Ver programa ↗</a>
          <ActionForm inline action={setProgramPublished} hidden={{ pid: id, publicar: publicado ? "no" : "si" }} submit={publicado ? "Ocultar" : "Publicar"} />
        </div>
      </Card>

      <Card>
        <h2 className="titular mb-3 text-xl">Contenido</h2>
        <ActionForm action={saveProgram} hidden={{ pid: id }} submit="Guardar programa">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Notas de dirección
            <textarea className={input} name="notas_direccion" rows={8} maxLength={8000} defaultValue={page?.notas_direccion ?? ""} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Firma (quién escribe las notas)
            <input className={input} name="firma_direccion" maxLength={120} defaultValue={page?.firma_direccion ?? ""} placeholder="Ej. Diego, director" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Mensaje extra (opcional)
            <textarea className={input} name="mensaje" rows={4} maxLength={4000} defaultValue={page?.mensaje ?? ""} placeholder="Ej. Por favor apaga tu celular…" />
          </label>
          <div className="flex flex-wrap gap-4">
            {check("mostrar_canciones", "Mostrar números musicales", page?.mostrar_canciones ?? true)}
            {check("mostrar_equipos", "Mostrar equipos", page?.mostrar_equipos ?? true)}
            {check("mostrar_agradecimientos", "Mostrar agradecimientos", page?.mostrar_agradecimientos ?? true)}
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Patrocinadores</h2>
        <ul className="flex flex-col gap-2">
          {sponsors.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sala px-3 py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className="grid h-14 w-24 place-items-center overflow-hidden rounded bg-white/5">
                  {s.logo_path ? <img src={assetUrl(s.logo_path)} alt={s.nombre} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-texto-3">Sin logo</span>}
                </span>
                <span>
                  <b>{s.nombre}</b>
                  {s.url && <span className="block text-xs text-texto-3">{s.url}</span>}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <ImageUpload compact productionId={id} kind="patrocinador" carpeta="programa" base={s.nombre} save={setSponsorLogo.bind(null, id, s.id)} label={s.logo_path ? "Cambiar logo" : "Subir logo"} />
                <ActionForm inline action={removeSponsor} hidden={{ pid: id, id: s.id }} confirm={`¿Quitar a ${s.nombre}?`} submit="Quitar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
              </span>
            </li>
          ))}
          {sponsors.length === 0 && <li className="text-sm text-texto-3">Aún no hay patrocinadores.</li>}
        </ul>
        <ActionForm action={addSponsor} hidden={{ pid: id }} submit="Agregar patrocinador">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
              <input className={input} name="nombre" required maxLength={120} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Enlace (opcional)
              <input className={input} name="url" type="url" placeholder="https://…" maxLength={500} />
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col items-start gap-3">
        <h2 className="titular text-xl">QR para la sala</h2>
        <p className="text-sm text-texto-2">Imprímelo en carteles o en el boleto. Abre: <span className="break-all text-texto">{link}</span></p>
        <img src={qr} alt="QR del programa" className="w-48 rounded-lg bg-white p-2" />
        <a href={qr} download={`programa-${id}.png`} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Descargar QR</a>
        {!publicado && <p className="text-xs text-texto-3">Mientras no lo publiques, el QR mostrará “no encontrado” al público.</p>}
      </Card>
    </div>
  );
}
