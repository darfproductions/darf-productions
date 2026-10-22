import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { saveVentaAjustes } from "./actions";

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

export type ValoresVenta = { funciones_publicadas?: boolean | null; modo_venta?: string | null; mostrar_precios?: boolean | null; mostrar_total?: boolean | null } | null;

// 0120: cómo se vende la obra (funciones publicadas, precios en la página, precios y total al apartar, esquema de
// venta). La misma tarjeta está en Funciones y precios y en Página pública.
export function VentaAjustes({ pid, v }: { pid: string; v: ValoresVenta }) {
  const publicadas = v?.funciones_publicadas !== false;
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
          <span className="text-xs text-texto-3">La Taquilla funciona igual en los tres. Los precios de cada zona se cambian en Funciones y precios.</span>
        </fieldset>
      </ActionForm>
    </Card>
  );
}
