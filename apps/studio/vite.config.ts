import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.P4STUDIO_PORT ?? "43122";
export default defineConfig({
  plugins: [react()],
  root: "src/front",
  build: {
    outDir: "../../dist/front",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 43121,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, ws: true },
      "/health": `http://127.0.0.1:${apiPort}`,
    },
  },
});
