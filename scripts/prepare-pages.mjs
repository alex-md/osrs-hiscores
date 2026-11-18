import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBuilder } from "vite";
import { workerBaseURL } from "./deployment-config.mjs";

export async function preparePages(outDir) {
  const apiBase = workerBaseURL();
  const revision = process.env.RELEASE_SHA || "local";
  if (revision !== "local" && !/^[a-f0-9]{40}$/.test(revision)) throw new Error("RELEASE_SHA must be a full commit SHA.");
  const configFile = fileURLToPath(new URL("../vite.config.js", import.meta.url));
  const builder = await createBuilder({ configFile, mode: "github-pages", build: { outDir } });
  await builder.buildApp();
  const output = builder.config.build.outDir;
  writeFileSync(join(output, "release.json"), JSON.stringify({ revision, apiBase }) + "\n");

  // Preserve old bookmarks from the former repository-root Pages artifact.
  mkdirSync(join(output, "frontend"));
  for (const file of ["index.html", "skill-hiscores.html", "achievements.html"]) {
    writeFileSync(
      join(output, "frontend", file),
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>OSRS Hiscores</title><script>location.replace('../${file}' + location.search + location.hash)</script><a href="../${file}">Open OSRS Hiscores</a></html>`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await preparePages();
  console.log("Prepared GitHub Pages artifact with Vite.");
}
