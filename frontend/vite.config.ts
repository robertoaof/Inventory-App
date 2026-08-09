import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Bind mount do Docker Desktop no Windows não propaga eventos de
    // sistema de arquivos pro container — sem polling, o watcher do Vite
    // (chokidar) nunca percebe mudanças feitas no host.
    watch: {
      usePolling: true,
    },
  },
});
