import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  optimizeDeps: {
    exclude: ["@3d-dice/dice-box"]
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true
  }
});
