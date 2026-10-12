import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Bind to every interface and accept any Host header so the game also runs when
  // it is reached through a LAN IP, a tunnel, or a hosted preview instead of
  // localhost. Vite otherwise rejects unknown hosts with HTTP 403.
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
});
