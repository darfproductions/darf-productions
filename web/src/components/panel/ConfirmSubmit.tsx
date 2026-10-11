"use client";

import { useFormStatus } from "react-dom";

// Botón de envío que pide confirmación antes de una acción importante.
export function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}
