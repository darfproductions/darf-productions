import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { TIPO_CREDITO } from "@/lib/casting";
import { sendOffer } from "./offer-actions";
import { BuscarCuenta } from "@/components/panel/BuscarCuenta";

// Formulario de oferta: por correo (elenco) o para una solicitud de audición (resultados).
export function OfferForm({ hidden, obras, papeles = [], porCorreo }: {
  hidden: Record<string, string>;
  /** Si viene más de una, se elige la obra (convocatorias generales). */
  obras?: { id: string; nombre: string }[];
  papeles?: string[];
  porCorreo?: boolean;
}) {
  const listId = `papeles-${hidden.application_id ?? "correo"}`;
  return (
    <ActionForm action={sendOffer} hidden={hidden} submit="Mandar oferta" submitClass="rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala disabled:opacity-60">
      <div className="grid gap-2 sm:grid-cols-2">
        {porCorreo && <BuscarCuenta className="sm:col-span-2" placeholder="Nombre o correo (debe tener cuenta DARF)" />}
        {obras && (
          <select className={`${input} sm:col-span-2`} name="production_id" required defaultValue="" aria-label="Obra">
            <option value="" disabled>¿Para qué obra?</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        )}
        <select className={input} name="tipo" defaultValue="reparto" aria-label="Tipo">
          {Object.entries(TIPO_CREDITO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={input} name="papel" list={listId} placeholder="Personaje o puesto (vacío si es ensamble o staff)" />
        <datalist id={listId}>{papeles.map((p) => <option key={p} value={p} />)}</datalist>
        <textarea className={`${input} min-h-16 sm:col-span-2`} name="mensaje" placeholder="Mensaje (opcional): ¡Felicidades! Primer ensayo el…" />
        <label className="flex flex-col gap-1 text-xs font-semibold">Responder antes de (opcional)<input className={input} type="date" name="responder_antes" /></label>
      </div>
    </ActionForm>
  );
}
