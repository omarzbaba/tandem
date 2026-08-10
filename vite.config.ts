import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel serves from the root. Overridable for a sub-path host such as a
// GitHub Pages project site, which would need "/<repo>/".
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2022",
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scout/**/*.test.mjs"],
  },
});
