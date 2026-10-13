"use client";

import { useState } from "react";
import { buttonGhost, input } from "@/components/panel/ui";
import type { EditState } from "./actions";
import { EditForm } from "./EditForm";

// Lista de renglones con dos campos (ficha extra: etiqueta/valor; videos: título/enlace).
export function RowsEditor({
  pid,
  action,
  initial,
  fields,
  submit,
  addLabel,
  hidden,
}: {
  pid: string;
  action: (prev: EditState, f: FormData) => Promise<EditState>;
  initial: [string, string][];
  fields: [{ name: string; placeholder: string }, { name: string; placeholder: string }];
  submit: string;
  addLabel: string;
  hidden?: Record<string, string>;
}) {
  const [rows, setRows] = useState(initial.length ? initial.map((r, i) => ({ key: i, a: r[0], b: r[1] })) : [{ key: 0, a: "", b: "" }]);
  const [next, setNext] = useState(rows.length);
  return (
    <EditForm action={action} pid={pid} submit={submit} hidden={hidden}>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.key} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input className={input} name={fields[0].name} placeholder={fields[0].placeholder} value={r.a} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
            <input className={input} name={fields[1].name} placeholder={fields[1].placeholder} value={r.b} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
            <button type="button" className={buttonGhost} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar</button>
          </li>
        ))}
      </ul>
      <button type="button" className={`${buttonGhost} self-start`} onClick={() => { setRows([...rows, { key: next, a: "", b: "" }]); setNext(next + 1); }}>
        {addLabel}
      </button>
    </EditForm>
  );
}
