import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "native-public",
  build: { outDir: "dist-native", rollupOptions: { input: "native.html" } },
});
