import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { workerBaseURL } from "./deployment-config.mjs";

const apiBase = workerBaseURL();
const revision = process.env.RELEASE_SHA || "local";
if (revision !== "local" && !/^[a-f0-9]{40}$/.test(revision)) throw new Error("RELEASE_SHA must be a full commit SHA.");
const output = new URL("../dist/pages/", import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(new URL("../frontend/", import.meta.url), output, { recursive: true });
writeFileSync(
  new URL("config.js", output),
  `globalThis.HISCORES_CONFIG = Object.freeze(${JSON.stringify({ apiBase })});\n`,
);
writeFileSync(
  new URL("release.json", output),
  JSON.stringify({ revision, apiBase }) + "\n",
);
// A new release gets fresh asset URLs even while Pages/CDN caches are warm.
for (const name of ["index.html", "skill-hiscores.html", "achievements.html"]) {
  const file = new URL(name, output);
  const html = readFileSync(file, "utf8").replace(/(styles\.css|app\.js|config\.js|theme\.js)(?:\?v=[^"']*)?/g, `$1?v=${revision}`);
  writeFileSync(file, html);
}
// Preserve old bookmarks from the former repository-root Pages artifact.
mkdirSync(new URL("frontend/", output));
for (const file of ["index.html", "skill-hiscores.html", "achievements.html"]) {
  writeFileSync(
    new URL(`frontend/${file}`, output),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>OSRS Hiscores</title><script>location.replace('../${file}' + location.search + location.hash)</script><a href="../${file}">Open OSRS Hiscores</a></html>`,
  );
}
console.log("Prepared GitHub Pages artifact from frontend assets.");
