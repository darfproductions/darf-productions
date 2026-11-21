import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { env } from "~/lib/env";

// En el teléfono la sesión se guarda con Preferences (almacenamiento nativo): iOS puede borrar el localStorage
// del WebView cuando le falta espacio y la persona quedaría fuera de su cuenta. En el navegador, localStorage.
const almacenNativo: SupportedStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: async (key, value) => { await Preferences.set({ key, value }); },
  removeItem: async (key) => { await Preferences.remove({ key }); },
};

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: Capacitor.isNativePlatform() ? almacenNativo : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
