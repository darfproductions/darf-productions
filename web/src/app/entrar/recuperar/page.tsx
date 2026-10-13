import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { env } from "@/lib/env";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function Recuperar() {
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="¿Olvidaste tu contraseña?">
        Escribe el correo de tu cuenta y te mandamos un enlace para poner una nueva.
      </PageHeading>
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5">
        <ResetForm captcha={env.turnstileSiteKey} />
        <Link href="/entrar" className="text-sm text-texto-2 underline">← Volver a entrar</Link>
      </div>
    </main>
  );
}
