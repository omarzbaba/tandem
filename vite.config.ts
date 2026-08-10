import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from /<repo>/, so assets must be
// repo-relative. Overridable for a custom domain or a local preview.
const base = process.env.VITE_BASE ?? "/tandem/";

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
