import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The shared pure-logic engine is consumed as TypeScript source (its
      // package.json `exports` points at ./src/index.ts). Map the package name
      // to that source so the client can import it without npm workspaces.
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
