import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocUpload } from "@/components/DocUpload";
import { ExpedienteForm } from "@/components/ExpedienteForm";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { MES_LABEL, SEMAFORO, adeudo, docsPendientes, edad, estadoCuotas, faltantes, mesNombre, pesos, semaforo } from "@/lib/member-rules";
import { getMemberData, signDocs } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi producción" };

type MyProd = { production_id: string; nombre: string; estado: string; papeles: string[] };

// Portal del integrante (etapa 3E): su expediente, documentos y mensualidades.
// Ensayos, materiales y avisos se suman en los siguientes bloques.
export default async function MyProduction({ params }: PageProps<"/cuenta/produccion/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/cuenta/produccion/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_productions");
  const prod = ((data ?? []) as MyProd[]).find((p) => p.production_id === id);
  if (!prod) notFound();
  const d = await getMemberData(id, session.userId);
  const e = edad(d.file?.fecha_nacimiento ?? null);
  const esMenor = e !== null && e < 18;
  const pend = docsPendientes(d.tipos, d.docs, esMenor);
  const sem = semaforo(d.file, pend.length);
  const urls = await signDocs(d.docs.map((x) => x.archivo_path));
  const ms = d.fee ? estadoCuotas(d.fee, d.terms, d.pagos) : [];
  const falta = [...faltantes(d.file), ...pend.map((t) => t.nombre)];

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mis producciones" title={prod.nombre}>{prod.papeles.join(" · ")}</PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-violeta-claro">← Mi cuenta</Link>

        <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-telon p-5">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${SEMAFORO[sem].cls}`}>{sem === "verde" ? "Expediente completo" : SEMAFORO[sem].label}</span>
          {falta.length > 0 && <p className="text-sm text-texto-2">Te falta: {falta.join(", ")}.</p>}
          {sem === "amarillo" && <p className="text-sm text-texto-2">Ya está todo; la producción lo revisará.</p>}
        </section>

        <section aria-labelledby="exp" className="rounded-2xl bg-telon p-6">
          <h2 id="exp" className="titular mb-1 text-2xl">Mi expediente</h2>
          <p className="mb-5 text-sm text-texto-2">Solo lo ven la producción y tú. Sirve para cuidarte en ensayos y funciones, y para tu vestuario.</p>
          <ExpedienteForm pid={id} uid={session.userId} f={d.file} esMenor={esMenor} />
        </section>

        {d.tipos.filter((t) => !t.solo_menores || esMenor).length > 0 && (
          <section aria-labelledby="docs" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="docs" className="titular text-2xl">Documentos</h2>
            <p className="text-sm text-texto-2">Puedes subir una foto o PDF. La producción marca cada uno como entregado cuando lo recibe (también puedes entregarlo en papel).</p>
            <ul className="flex flex-col gap-2">
              {d.tipos.filter((t) => !t.solo_menores || esMenor).map((t) => {
                const doc = d.docs.find((x) => x.doc_type_id === t.id);
                const url = doc?.archivo_path ? urls.get(doc.archivo_path) : undefined;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2.5 text-sm">
                    <span><b>{t.nombre}</b>{t.obligatorio ? "" : " · opcional"}
                      <span className="block text-xs text-texto-3">{doc?.entregado_at ? "✓ Recibido por la producción" : doc?.archivo_path ? "Subido, falta que la producción lo revise" : "Pendiente"}
                        {url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">ver</a></>}</span>
                    </span>
                    {!doc?.entregado_at && <DocUpload pid={id} uid={session.userId} docTypeId={t.id} hay={!!doc?.archivo_path} />}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {d.fee && (
          <section aria-labelledby="cuotas" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="cuotas" className="titular text-2xl">Mis mensualidades</h2>
            {d.terms.beca ? <p className="text-sm">Tienes beca: no pagas mensualidad.</p> : (
              <p className="text-sm">Mensualidad: <b>{pesos(Number(d.terms.cuota_especial ?? d.fee.monto))}</b> · pagar antes del día {d.fee.dia_limite} de cada mes · Adeudo a hoy: <b>{pesos(adeudo(ms))}</b></p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ms.map((m) => (
                <li key={m.periodo} className="flex items-center justify-between rounded-lg bg-sala px-3 py-2 text-sm">
                  <span className="capitalize">{mesNombre(m.periodo)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MES_LABEL[m.estado].cls}`}>{MES_LABEL[m.estado].label}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-texto-3">Los pagos los registra la producción. Si ves algo que no coincide, avísales.</p>
          </section>
        )}
      </div>
    </main>
  );
}
