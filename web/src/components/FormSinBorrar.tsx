"use client";

import { startTransition, useEffect, useRef, type FormHTMLAttributes, type Ref } from "react";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  /** La acción (de servidor o la de useActionState). Recibe los datos del formulario. */
  action: (datos: FormData) => unknown;
  /** El resultado de la acción (el `state` de useActionState): si trae ok, se vacía el formulario. Si no se pasa, nunca. */
  limpiarCon?: { ok?: boolean } | null;
  ref?: Ref<HTMLFormElement>;
};

// Formulario que NO se borra al mandar (React lo vaciaba siempre, aunque hubiera un error): lo escrito se queda para
// corregirlo. Respeta un onSubmit propio (si cancela con preventDefault, no se manda) y el botón con que se mandó.
export function FormSinBorrar({ action, limpiarCon, onSubmit, ref, children, ...rest }: Props) {
  const interno = useRef<HTMLFormElement | null>(null);
  useEffect(() => { if (limpiarCon?.ok) interno.current?.reset(); }, [limpiarCon]);
  const enviar: NonNullable<FormHTMLAttributes<HTMLFormElement>["onSubmit"]> = (e) => {
    onSubmit?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const datos = new FormData(e.currentTarget, boton);
    startTransition(() => { void action(datos); });
  };
  const ponerRef = (el: HTMLFormElement | null) => {
    interno.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLFormElement | null }).current = el;
  };
  return <form {...rest} ref={ponerRef} onSubmit={enviar}>{children}</form>;
}
