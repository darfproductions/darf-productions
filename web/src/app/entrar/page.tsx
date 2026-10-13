import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { getSession, safeNext } from "@/lib/auth";
import { env } from "@/lib/env";
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
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5">
        {sp.error === "enlace" && (
          <p role="alert" className="rounded-xl border border-[#ff8fa3]/40 bg-[#3a1220] px-4 py-3 text-sm">
            El enlace ya venció o ya se usó. Entra con tu correo y contraseña; si no la recuerdas, usa “¿Olvidaste tu contraseña?” para recibir uno nuevo.
          </p>
        )}
        {sp.error === "google" && (
          <p role="alert" className="rounded-xl border border-[#ff8fa3]/40 bg-[#3a1220] px-4 py-3 text-sm">
            No se completó la entrada con Google (se canceló o Google no respondió). Intenta de nuevo o entra con tu correo.
          </p>
        )}
        <AuthForms next={next} captcha={env.turnstileSiteKey} />
      </div>
    </main>
  );
}
