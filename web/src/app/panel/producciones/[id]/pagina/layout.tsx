import { VistaPrevia } from "./VistaPrevia";

// Página pública (0138): el editor a la izquierda y, en pantallas grandes, la vista previa a la derecha.
export default async function Layout({ children, params }: LayoutProps<"/panel/producciones/[id]/pagina">) {
  const { id } = await params;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">{children}</div>
      <VistaPrevia pid={id} />
    </div>
  );
}
