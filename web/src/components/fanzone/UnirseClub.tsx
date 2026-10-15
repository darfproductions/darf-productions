import { esCuentaEmpresa } from "@/lib/credencial";
import { UnirseClubBoton } from "./UnirseClubBoton";

// "Unirme al Club Fan"; la cuenta de la empresa (0111) no puede ser socia.
export async function UnirseClub() {
  if (await esCuentaEmpresa()) {
    return <p className="text-sm text-texto-2">Esta es la cuenta de la empresa: no forma parte del Club Fan.</p>;
  }
  return <UnirseClubBoton />;
}
