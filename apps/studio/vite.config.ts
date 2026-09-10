import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
      "/api": "http://127.0.0.1:43120",
      "/health": "http://127.0.0.1:43120",
    },
  },
});
