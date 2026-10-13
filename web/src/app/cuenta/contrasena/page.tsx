import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { RECOVERY_COOKIE, requireSession } from "@/lib/auth";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default async function ContrasenaNueva({ searchParams }: PageProps<"/cuenta/contrasena">) {
  const listo = (await searchParams).listo === "1";
  const session = await requireSession("/cuenta/contrasena");
  const valido = (await cookies()).get(RECOVERY_COOKIE)?.value === session.userId;
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="Contraseña nueva" />
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5">
        {listo ? (
          <p role="status" className="text-lg">Listo, ya tienes contraseña nueva. Cerramos tu sesión en los demás dispositivos. <Link href="/cuenta" className="underline">Ir a Mi cuenta</Link></p>
        ) : valido ? <NewPasswordForm /> : (
          <p className="text-texto-2">
            Esta página es para el enlace de “¿Olvidaste tu contraseña?”. Para cambiarla sabiendo la actual, ve a{" "}
            <Link href="/cuenta" className="underline">Mi cuenta → Correo y contraseña</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
