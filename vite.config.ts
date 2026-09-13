import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: { host: "::", port: 8080 },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "/",
  build: {
    outDir: "dist",
    rollupOptions: { output: { manualChunks(id) {
      if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-runtime";
      if (id.includes("/node_modules/@supabase/")) return "supabase-client";
    } } },
  },
});
