import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the same build works at the root of a dev server and under
// https://pscactux.github.io/webgl-shader-lab/ on GitHub Pages.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
