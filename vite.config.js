import { defineConfig } from "vite";
import { cpSync } from "node:fs";

// js/app.js é um script clássico (sem type="module") para funcionar também
// abrindo o index.html direto do disco. O Vite não empacota scripts clássicos,
// então este plugin copia js/ e css/ para o dist no build.
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "copy-static-assets",
      closeBundle() {
        cpSync("js", "dist/js", { recursive: true });
        cpSync("css", "dist/css", { recursive: true });
      },
    },
  ],
});
