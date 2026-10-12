import { redirect } from "next/navigation";

// Cartelera se unió con Producciones (decisión de Diego): las ligas viejas siguen funcionando.
export default async function CarteleraPage({ searchParams }: PageProps<"/cartelera">) {
  const sp = await searchParams;
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  redirect(estado ? `/producciones?estado=${encodeURIComponent(estado)}` : "/producciones");
}
