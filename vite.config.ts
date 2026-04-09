import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  optimizeDeps: {
    exclude: ["@3d-dice/dice-box"]
  },
  server: {
    // Discord local testing commonly uses a Cloudflare tunnel that presents a
    // random *.trycloudflare.com hostname to the Vite dev server.
    allowedHosts: [".trycloudflare.com"],
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
