import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8080,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 8080,
    strictPort: false
  }
});
