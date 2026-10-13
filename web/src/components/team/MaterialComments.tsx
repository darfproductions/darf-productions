import { ActionForm } from "@/components/panel/ActionForm";
import { addTeamComment, removeTeamComment } from "@/lib/team-actions";
import type { TeamComment } from "@/lib/team";

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Hilo de comentarios de un material del equipo (0066): cualquiera que lo ve, comenta.
export function MaterialComments({ espacio, materialId, comentarios, nombres, yo, puedeBorrarTodo }: {
  espacio: string; materialId: string; comentarios: TeamComment[]; nombres: Map<string, string>; yo: string; puedeBorrarTodo: boolean;
}) {
  return (
    <details className="text-xs" open={comentarios.length > 0 && comentarios.length <= 3}>
      <summary className="cursor-pointer font-bold text-texto-2">{comentarios.length ? `${comentarios.length} ${comentarios.length === 1 ? "comentario" : "comentarios"}` : "Comentar"}</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {comentarios.map((c) => (
          <li key={c.id} className="rounded-lg bg-telon px-3 py-2">
            <p><b>{nombres.get(c.autor) ?? "Equipo"}</b> <span className="text-texto-3">· {fecha(c.created_at)}</span></p>
            <p className="whitespace-pre-line text-sm">{c.cuerpo}</p>
            {(c.autor === yo || puedeBorrarTodo) && (
              <ActionForm inline action={removeTeamComment} hidden={{ espacio, id: c.id }} submit="Borrar" submitClass="text-[11px] font-bold text-[#ff8fa3]" />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <ActionForm inline action={addTeamComment} hidden={{ espacio, material: materialId }} submit="Enviar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">
          <input name="cuerpo" maxLength={2000} required placeholder="Escribe una nota sobre este material…" className="min-w-[14rem] flex-1 rounded-lg bg-sala px-3 py-2 text-sm" />
        </ActionForm>
      </div>
    </details>
  );
}
