import { redirect } from "next/navigation";

// Dirección vieja: Usuarios y Talento ahora son Personas → Directorio.
export default async function OldUsuarios({ searchParams }: PageProps<"/panel/usuarios">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  redirect(`/panel/personas${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}
