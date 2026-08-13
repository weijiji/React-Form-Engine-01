import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The shared pure-logic engine is consumed as TypeScript source. Map the
      // package name to ../shared/src/index.ts so the client can import it
      // without npm workspaces (the package's own `exports` targets the dist
      // build used by the server).
      "form-engine-core": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: true, // Listen on all interfaces (needed for Docker)
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
