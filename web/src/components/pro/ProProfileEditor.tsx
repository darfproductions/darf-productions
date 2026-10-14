/* eslint-disable @next/next/no-img-element -- fotos del perfil desde Storage */
import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { removeProPhoto, saveProProfile, setProRetrato } from "@/app/cuenta/perfil-profesional/actions";
import type { ProPhoto } from "@/lib/pro-profile";
import { LISTAS, TESITURAS, type ProProfile } from "@/lib/pro-rules";
import { perfilUrl } from "@/lib/productions";
import { ProPhotoUpload } from "./ProPhotoUpload";
import { TrayectoriaRows } from "./TrayectoriaRows";
import { Icono } from "@/components/Icono";

const card = "flex flex-col gap-3 rounded-2xl bg-telon p-6";
const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold";

// Editor del perfil profesional (0057): lo usan Mi cuenta (la persona) y el panel (equipo).
export function ProProfileEditor({ pid, nombre, pro, fotos, team, esMenor }: {
  pid: string; nombre: string; pro: ProProfile | null; fotos: ProPhoto[]; team: boolean; esMenor: boolean;
}) {
  const h = pro?.habilidades ?? {};
  const publico = !!pro?.publico && (!esMenor || !!pro?.tutor_autorizado_at);
  return (
    <div className="flex flex-col gap-6">
      <section className={card}>
        <h2 className="text-lg font-bold">Retrato profesional</h2>
        <p className="text-sm text-texto-2">Foto de frente, buena luz, fondo liso. Sale en tu perfil y en el elenco de las obras que no tengan foto tuya.</p>
        <div className="flex items-center gap-4">
          <span className="grid h-32 w-24 place-items-center overflow-hidden rounded-xl bg-telon-2 text-2xl font-black">
            {pro?.retrato_path ? <img src={perfilUrl(pro.retrato_path)} alt={`Retrato de ${nombre}`} className="h-full w-full object-cover" /> : nombre.slice(0, 1)}
          </span>
          <span className="flex flex-col items-start gap-2">
            <ProPhotoUpload pid={pid} kind="retrato" label={pro?.retrato_path ? "Cambiar retrato" : "Subir retrato"} />
            {pro?.retrato_path && <form action={async () => { "use server"; await setProRetrato(pid, null); }}><button className="text-xs text-texto-3 underline">Quitar retrato</button></form>}
          </span>
        </div>
      </section>

      <ActionForm action={saveProProfile} hidden={{ pid }} submit="Guardar perfil">
        <section className={card}>
          <h2 className="text-lg font-bold">Sobre ti</h2>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Semblanza
            <textarea className={input} name="semblanza" rows={6} maxLength={3000} defaultValue={pro?.semblanza ?? ""} placeholder="Quién eres, tu formación y lo que más te gusta hacer en escena." />
          </label>
        </section>
        <section className={card}>
          <h2 className="text-lg font-bold">Trayectoria fuera de DARF</h2>
          <p className="text-sm text-texto-2">Tus obras con DARF aparecen solas.</p>
          <TrayectoriaRows initial={pro?.trayectoria ?? []} />
        </section>
        <section className={card}>
          <h2 className="text-lg font-bold">Habilidades</h2>
          <label className="flex flex-col gap-1.5 text-sm font-semibold sm:max-w-xs">Canto (tesitura)
            <select className={input} name="canto" defaultValue={h.canto ?? ""}>
              <option value="">—</option>
              {TESITURAS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {LISTAS.map((l) => (
              <label key={l.key} className="flex flex-col gap-1.5 text-sm font-semibold">{l.label}
                <input className={input} name={l.key} defaultValue={(h[l.key] ?? []).join(", ")} placeholder={l.ejemplo} />
              </label>
            ))}
          </div>
          <p className="text-xs text-texto-3">Separa con comas.</p>
        </section>
        <section className={card}>
          <h2 className="text-lg font-bold">Redes y reel</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Instagram<input className={input} name="instagram" defaultValue={pro?.instagram ?? ""} placeholder="@usuario" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">TikTok<input className={input} name="tiktok" defaultValue={pro?.tiktok ?? ""} placeholder="@usuario" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Canal de YouTube<input className={input} name="youtube" defaultValue={pro?.youtube ?? ""} placeholder="https://youtube.com/@…" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Reel (video)<input className={input} name="reel_url" defaultValue={pro?.reel_url ?? ""} placeholder="https://youtu.be/…" /></label>
          </div>
        </section>
        <section className={card}>
          <h2 className="text-lg font-bold">¿Quién lo ve?</h2>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="publico" defaultChecked={pro?.publico} className="mt-1" />
            <span>Hacer público mi perfil en <b>/artistas/{pro?.slug ?? "tu-nombre"}</b>. Tu nombre en el elenco de las obras enlazará aquí. Nunca se muestran tu teléfono, correo ni datos del expediente.</span>
          </label>
          {esMenor && (
            team ? (
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="tutor" defaultChecked={!!pro?.tutor_autorizado_at} className="mt-1" />
                <span><b>Es menor de edad.</b> Tengo el permiso de su madre, padre o tutor para publicar este perfil.</span>
              </label>
            ) : (
              <p className="rounded-lg bg-sala p-3 text-sm text-aviso">Eres menor de edad: tu perfil solo será público cuando la producción registre el permiso de tu madre, padre o tutor.{pro?.tutor_autorizado_at ? " (Ya está registrado.)" : ""}</p>
            )
          )}
          {pro && <p className="text-sm text-texto-2">Ahora: {publico ? <a href={`/artistas/${pro.slug}`} className="font-bold text-violeta-claro underline">público <Icono nombre="externo" /></a> : "privado"}</p>}
        </section>
      </ActionForm>

      <section className={card}>
        <h2 className="text-lg font-bold">Galería <span className="text-sm font-normal text-texto-3">· {fotos.length} de 6</span></h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f) => (
            <li key={f.id} className="relative overflow-hidden rounded-xl">
              <img src={perfilUrl(f.path)} alt="" className="aspect-[4/5] w-full object-cover" />
              <span className="absolute right-2 top-2"><ActionForm inline action={removeProPhoto} hidden={{ pid, id: f.id }} confirm="¿Quitar esta foto?" submit={<Icono nombre="x" etiqueta="Quitar" />} submitClass={`${small} bg-black/70`} /></span>
            </li>
          ))}
        </ul>
        {fotos.length < 6 && <ProPhotoUpload pid={pid} kind="galeria" label="Agregar foto" />}
      </section>
    </div>
  );
}
