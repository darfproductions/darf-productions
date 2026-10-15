import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { renamePerson } from "./actions";

// Nombre de la ficha: el que sale en la página de cada obra, el programa y el perfil profesional.
export function NombreFicha({ id, nombre }: { id: string; nombre: string }) {
  return (
    <details className="self-start">
      <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Editar nombre</summary>
      <div className="mt-2 flex max-w-md flex-col gap-2">
        <p className="text-xs text-texto-2">Es el nombre que sale en los créditos de todas sus obras, el programa y su perfil profesional. Su cuenta no lo cambia.</p>
        <ActionForm action={renamePerson} hidden={{ id }} submit="Guardar" confirm="¿Cambiar el nombre en todas sus obras?">
          <input className={input} name="nombre" defaultValue={nombre} required maxLength={120} aria-label="Nombre en los créditos" />
        </ActionForm>
      </div>
    </details>
  );
}
