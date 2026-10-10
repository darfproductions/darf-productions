import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { getSession, safeNext } from "@/lib/auth";
import { AuthForms } from "./AuthForms";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await getSession()) redirect(next);

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="Entra a DARF">
        Con tu cuenta compras boletos, ves tus códigos QR y entras a la Fan Zone.
      </PageHeading>
      <div className="mx-auto max-w-md px-5">
        <AuthForms next={next} />
      </div>
    </main>
  );
}
