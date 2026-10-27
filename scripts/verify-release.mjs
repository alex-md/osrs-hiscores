import { pathToFileURL } from "node:url";
import { workerBaseURL } from "./deployment-config.mjs";

export async function verifyRelease({ target, revision, workerURL = workerBaseURL(), siteURL,
  fetcher = fetch, attempts = 8, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!/^[a-f0-9]{40}$/.test(revision || "")) throw new Error("A full release commit SHA is required.");
  if (!["worker", "pages"].includes(target)) throw new Error("Choose worker or pages verification.");
  if (target === "pages" && !siteURL) throw new Error("The deployed Pages URL is required.");
  const url = target === "worker" ? new URL("/api/health", workerURL) : new URL("release.json", siteURL.endsWith("/") ? siteURL : `${siteURL}/`);
  // Bypass browser/edge caches while waiting for a deployment to propagate.
  url.searchParams.set("release", revision);
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { headers: { accept: "application/json", "cache-control": "no-cache" }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.revision !== revision) throw new Error("The deployed commit does not match this release.");
      if (target === "worker" && (result.status !== "ok" || result.storage !== "durable-object-sqlite" || !result.hasDurableObject))
        throw new Error("The Worker does not have a healthy SQLite Durable Object binding.");
      if (target === "pages" && result.apiBase !== workerURL)
        throw new Error("GitHub Pages points to a different Worker URL.");
      return result;
    } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) await wait(5000);
    }
  }
  throw new Error(`${target} release verification failed: ${failure?.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  await verifyRelease({ target, revision: process.env.RELEASE_SHA, siteURL: process.env.PAGES_URL });
  console.log(`${target} is serving commit ${process.env.RELEASE_SHA}.`);
}
