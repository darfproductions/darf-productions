import type { CapacitorConfig } from "@capacitor/cli";

// Configuración de la app nativa (iOS y Android). La interfaz es la carpeta dist/ que genera Vite.
const config: CapacitorConfig = {
  appId: "com.darfproductions.app",
  appName: "DARF",
  webDir: "dist",
  // La app se sirve como https://app.darfproductions.com en Android (y capacitor://app.darfproductions.com en iOS),
  // para que Cloudflare Turnstile reconozca el dominio. Ver README.md → Captcha.
  server: { hostname: "app.darfproductions.com", androidScheme: "https" },
  backgroundColor: "#0b0b0b",
  ios: { contentInset: "never" },
  plugins: {
    SplashScreen: { launchShowDuration: 900, launchAutoHide: true, backgroundColor: "#0b0b0b", showSpinner: false },
    StatusBar: { overlaysWebView: true, style: "DARK" },
  },
};

export default config;
