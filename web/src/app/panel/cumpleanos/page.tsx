import type { Metadata } from "next";
import Link from "next/link";
import { BirthdayList } from "@/components/BirthdayList";
import { Card, PanelTitle } from "@/components/panel/ui";
import { cumplesDelMes, MESES, type Cumple } from "@/lib/account-rules";
import { requireCasa } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { partesMx } from "@/lib/dates";

export const metadata: Metadata = { title: "Cumpleaños" };

// Cumpleaños de todas las cuentas que pusieron su fecha (solo el Director).
export default async function Cumpleanos({ searchParams }: PageProps<"/panel/cumpleanos">) {
  await requireCasa("casa.personas", "/panel/cumpleanos");
  const sp = await searchParams;
  const actual = partesMx().m;
  const m = Number(sp.mes);
  const mes = Number.isInteger(m) && m >= 1 && m <= 12 ? m : actual;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("birthdays");
  const todos = (data ?? []) as Cumple[];
  const delMes = cumplesDelMes(todos, mes);
  const paths = delMes.map((c) => c.foto_path).filter((p): p is string => !!p);
  const signed = paths.length ? (await supabase.storage.from("avatares").createSignedUrls(paths, 3600)).data ?? [] : [];
  const fotos = new Map(signed.filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string]));

  return (
    <>
      <PanelTitle eyebrow="Personas" title="Cumpleaños">
        {todos.length} {todos.length === 1 ? "persona tiene" : "personas tienen"} su fecha registrada. Cada quien la pone en Mi cuenta (o en su expediente).
      </PanelTitle>
      <div className="flex flex-col gap-4">
        <nav aria-label="Mes" className="flex flex-wrap gap-2 text-sm">
          {MESES.map((nombre, i) => (
            <Link key={nombre} href={`/panel/cumpleanos?mes=${i + 1}`}
              className={`rounded-full border px-3 py-1.5 font-semibold capitalize ${mes === i + 1 ? "border-texto" : "border-white/20"}`}>
              {nombre} ({cumplesDelMes(todos, i + 1).length})
            </Link>
          ))}
        </nav>
        <Card>
          <h2 className="titular mb-3 text-xl capitalize">{MESES[mes - 1]}</h2>
          {error ? <p className="text-sm text-[#ff8fa3]">{error.message}</p> : <BirthdayList items={delMes} fotos={fotos} />}
        </Card>
      </div>
    </>
  );
}
