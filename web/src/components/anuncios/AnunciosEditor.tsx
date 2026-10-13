import { ActionForm } from "@/components/panel/ActionForm";
import { buttonGhost } from "@/components/panel/ui";
import { deleteAnuncio, setAnuncioPublicado } from "@/lib/anuncio-panel-actions";
import { LUGARES_ANUNCIO, TIPOS_ANUNCIO, type AnuncioLugar } from "@/lib/anuncio-rules";
import { listAnunciosPanel } from "@/lib/anuncios";
import { AnuncioForm } from "./AnuncioForm";

/** ¿La fecha todavía no llega? (fuera del componente: es una lectura del reloj, no parte del dibujo). */
const enFuturo = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Lista de anuncios con su estado y edición en el lugar, más el formulario para crear uno.
// scope "sitio" = inicio y Fan Zone general (Director); si no, el id de la obra.
export async function AnunciosEditor({ scope }: { scope: string }) {
  const lugares: AnuncioLugar[] = scope === "sitio" ? ["inicio", "fanzone"] : ["obra", "fanzone"];
  const lista = await listAnunciosPanel(scope === "sitio" ? { sitio: true } : { pid: scope });
  return (
    <div className="flex flex-col gap-5">
      {lista.length === 0 && <p className="text-sm text-texto-3">Todavía no hay anuncios.</p>}
      <ul className="flex flex-col gap-3">
        {lista.map((a) => {
          const porRevelar = enFuturo(a.revela_at);
          return (
            <li key={a.id} className="rounded-[18px] border border-linea bg-sala/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-oro">{TIPOS_ANUNCIO[a.tipo]} · {LUGARES_ANUNCIO[a.lugar]}</p>
                  <p className="font-bold">{a.titulo}</p>
                  <p className="text-xs text-texto-3">
                    {a.publicado ? "Publicado" : "Oculto"}
                    {a.revela_at && <> · {porRevelar ? "Se revela" : "Revelado"} el {fecha(a.revela_at)}</>}
                    {a.registro && <> · {a.registros} {a.registros === 1 ? "persona apuntada" : "personas apuntadas"}{a.avisado_at ? " (ya se les avisó)" : ""}</>}
                    {a.solo_club && <> · Solo Club Fan</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm inline action={setAnuncioPublicado} hidden={{ scope, id: a.id, valor: a.publicado ? "no" : "si" }} submit={a.publicado ? "Ocultar" : "Publicar"} submitClass={buttonGhost} />
                  <ActionForm inline action={deleteAnuncio} hidden={{ scope, id: a.id }} confirm={`¿Borrar el anuncio "${a.titulo}"?`} submit="Borrar" submitClass={buttonGhost} />
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-lila">Editar</summary>
                <div className="pt-3"><AnuncioForm scope={scope} lugares={lugares} a={a} /></div>
              </details>
            </li>
          );
        })}
      </ul>
      <details className="rounded-[18px] border border-linea p-4" open={lista.length === 0}>
        <summary className="cursor-pointer font-bold">+ Nuevo anuncio</summary>
        <div className="pt-4"><AnuncioForm scope={scope} lugares={lugares} /></div>
      </details>
    </div>
  );
}
