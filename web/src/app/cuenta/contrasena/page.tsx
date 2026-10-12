import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { RECOVERY_COOKIE, requireSession } from "@/lib/auth";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default async function ContrasenaNueva() {
  await requireSession("/cuenta/contrasena");
  const valido = !!(await cookies()).get(RECOVERY_COOKIE);
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="Contraseña nueva" />
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5">
        {valido ? <NewPasswordForm /> : (
          <p className="text-texto-2">
            Esta página es para el enlace de “¿Olvidaste tu contraseña?”. Para cambiarla sabiendo la actual, ve a{" "}
            <Link href="/cuenta" className="underline">Mi cuenta → Correo y contraseña</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
