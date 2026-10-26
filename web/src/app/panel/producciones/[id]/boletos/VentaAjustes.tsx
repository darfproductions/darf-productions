import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { plazoEnUnidad } from "@/lib/ventas-rules";
import { saveApartados, saveVentaAjustes } from "./actions";

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

export type ValoresVenta = { funciones_publicadas?: boolean | null; modo_venta?: string | null; mostrar_precios?: boolean | null; mostrar_total?: boolean | null;
  /** 0128 */ apartados_vencen?: boolean | null; apartados_horas?: number | null } | null;

// 0120: cómo se vende la obra (funciones publicadas, precios en la página, precios y total al apartar, esquema de
// venta). La misma tarjeta está en Funciones y horarios y en Página pública.
export function VentaAjustes({ pid, v }: { pid: string; v: ValoresVenta }) {
  const publicadas = v?.funciones_publicadas !== false;
  const plazo = plazoEnUnidad(v?.apartados_horas ?? 24);
  return (
    <Card className={`flex flex-col gap-3 ${publicadas ? "" : "border border-aviso/50"}`}>
      <div>
        <h2 className="titular text-xl">Venta y precios</h2>
        <p className="text-sm text-texto-2">
          {publicadas ? "Las funciones se ven en la página de la obra." : <b className="text-aviso">Las funciones están ocultas: el público no ve fechas, cuenta regresiva ni compra. Tú y el equipo sí las ven aquí.</b>}
        </p>
      </div>
      <ActionForm action={saveVentaAjustes} hidden={{ pid }} submit="Guardar" submitClass={ghost}>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="funciones_publicadas" defaultChecked={publicadas} className="mt-1" />
          <span><b>Funciones publicadas</b> — sin la palomita, las funciones, fechas y la cuenta regresiva no salen en ningún lado de la página.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="mostrar_precios" defaultChecked={v?.mostrar_precios !== false} className="mt-1" />
          <span><b>Precios en la página de la obra</b> — sin la palomita las zonas salen sin precio y no sale &quot;Desde $…&quot;.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="mostrar_total" defaultChecked={v?.mostrar_total !== false} className="mt-1" />
          <span><b>Precios, subtotal y total al elegir lugares</b> — sin la palomita, en el mapa solo salen las zonas: ni precios, ni subtotal, ni total. El total solo va en el mensaje de WhatsApp.</span></label>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-semibold">Venta</legend>
          <label className="flex items-start gap-2"><input type="radio" name="modo_venta" value="web" defaultChecked={!v?.modo_venta || v.modo_venta === "web"} className="mt-1" />
            <span><b>Solo por la página</b> — &quot;Comprar boletos&quot;: con su cuenta eligen lugares, se crea su orden con su total y en el pago eligen el método (hoy: WhatsApp). Al aprobar el pago les sale su boleto con QR.</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="modo_venta" value="hibrido" defaultChecked={v?.modo_venta === "hibrido"} className="mt-1" />
            <span><b>Híbrido</b> — &quot;Aparta tu lugar&quot;: eligen su lugar en el mapa (con su cuenta), tocan Siguiente y se abre WhatsApp con su código para seguir ahí.</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="modo_venta" value="whatsapp" defaultChecked={v?.modo_venta === "whatsapp"} className="mt-1" />
            <span><b>Todo por WhatsApp</b> — &quot;Más información por WhatsApp&quot;: la página no aparta y el botón abre WhatsApp; el equipo vende desde Taquilla.</span></label>
          <span className="text-xs text-texto-3">La Taquilla funciona igual en los tres. Los precios de cada zona se cambian en Funciones y horarios.</span>
        </fieldset>
      </ActionForm>
      {/* 0128: cada obra decide si los apartados sin pagar se cancelan solos y en cuánto tiempo. */}
      <div className="border-t border-white/10 pt-3">
        <h3 className="font-bold">Apartados sin pagar</h3>
        <p className="text-sm text-texto-2">Cuando alguien aparta en la página y aún no paga.</p>
      </div>
      <ActionForm action={saveApartados} hidden={{ pid }} submit="Guardar apartados" submitClass={ghost}>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="vence" defaultChecked={v?.apartados_vencen !== false} className="mt-1" />
          <span><b>Se cancelan solos si no pagan a tiempo</b> — los lugares se liberan para que otros los compren. Sin la palomita, el apartado se respeta hasta que lo apruebes o lo canceles en Órdenes (aunque paguen en un mes).</span></label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Plazo para pagar</span>
          <input className="w-20 rounded-lg border border-white/10 bg-sala px-3 py-2" type="number" name="plazo" min={1} max={720} step={1} defaultValue={plazo.n} aria-label="Plazo para pagar" />
          <select name="unidad" defaultValue={plazo.unidad} className="rounded-lg border border-white/10 bg-sala px-3 py-2" aria-label="Unidad del plazo">
            <option value="horas">horas</option>
            <option value="dias">días</option>
          </select>
          <span className="text-xs text-texto-3">De 1 hora a 30 días; nunca después de 3 h antes de la función. Solo cuenta con la palomita.</span>
        </div>
      </ActionForm>
    </Card>
  );
}
