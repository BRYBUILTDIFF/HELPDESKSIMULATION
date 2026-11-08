import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  let apiOrigin = "";
  try { apiOrigin = new URL(env.VITE_API_URL).origin; } catch (_) { /* Same-origin API. */ }
  let guacamoleOrigin = "";
  try { guacamoleOrigin = new URL(env.VITE_GUACAMOLE_ORIGIN).origin; } catch (_) {}
  if (mode === "production" && !guacamoleOrigin) throw new Error("Set VITE_GUACAMOLE_ORIGIN to the exact Guacamole origin before building production.");
  return {
  plugins: [react(), {
    name: "production-content-security-policy",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: {
        "http-equiv": "Content-Security-Policy",
        content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${apiOrigin}; frame-src 'self' ${guacamoleOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'`
      }, injectTo: "head-prepend" }];
    }
  }],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  }
  };
});
