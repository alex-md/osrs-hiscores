import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const fallback = "https://osrs-hiscores-clone.vs.workers.dev";
const base = new URL(process.env.WORKER_BASE_URL || fallback);
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error(
    "WORKER_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.",
  );
const apiBase = base.href.replace(/\/$/, "").replace(/\/api$/, "");
const output = new URL("../dist/pages/", import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(new URL("../frontend/", import.meta.url), output, { recursive: true });
writeFileSync(
  new URL("config.js", output),
  `globalThis.HISCORES_CONFIG = Object.freeze(${JSON.stringify({ apiBase })});\n`,
);
// Preserve old bookmarks from the former repository-root Pages artifact.
mkdirSync(new URL("frontend/", output));
for (const file of ["index.html", "skill-hiscores.html", "achievements.html"]) {
  writeFileSync(
    new URL(`frontend/${file}`, output),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>OSRS Hiscores</title><script>location.replace('../${file}' + location.search + location.hash)</script><a href="../${file}">Open OSRS Hiscores</a></html>`,
  );
}
console.log("Prepared GitHub Pages artifact from frontend assets.");
