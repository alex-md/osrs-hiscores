import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workerBaseURL } from "./scripts/deployment-config.mjs";

const root = new URL("./frontend/", import.meta.url);

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(root),
  base: "./",
  define: {
    __HISCORES_API_BASE__: JSON.stringify(mode === "github-pages" ? workerBaseURL() : ""),
  },
  build: {
    outDir: fileURLToPath(new URL(mode === "github-pages" ? "./dist-pages/" : "./dist/", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: ["index.html", "skill-hiscores.html", "achievements.html"].map(
        (page) => fileURLToPath(new URL(page, root)),
      ),
    },
  },
}));
