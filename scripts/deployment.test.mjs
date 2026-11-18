import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { workerBaseURL, DEFAULT_WORKER_URL } from "./deployment-config.mjs";
import { verifyRelease } from "./verify-release.mjs";
const revision = "1234567890abcdef1234567890abcdef12345678";
const healthy = { status: "ok", revision, hasDurableObject: true, storage: "durable-object-sqlite" };

test("frontend and release checks share a validated Worker origin", () => {
  assert.equal(workerBaseURL(DEFAULT_WORKER_URL), DEFAULT_WORKER_URL);
  assert.equal(workerBaseURL("https://worker.example/api/"), "https://worker.example");
  for (const bad of ["file:///tmp/key", "https://user:secret@worker.example", "https://worker.example?key=secret", "https://worker.example/#fragment", "https://worker.example/other-app"])
    assert.throws(() => workerBaseURL(bad));
});

test("Worker verification requires the release commit and SQLite Durable Object health", async () => {
  let calls = 0;
  const result = await verifyRelease({ target: "worker", revision, workerURL: "https://worker.example", fetcher: async (url, options) => {
    calls++;
    assert.equal(url.pathname, "/api/health");
    assert.equal(url.searchParams.get("release"), revision);
    assert.equal(options.headers["cache-control"], "no-cache");
    return Response.json(healthy);
  } });
  assert.equal(result.revision, revision);
  assert.equal(calls, 1);
  for (const body of [{ ...healthy, revision: "old" }, { ...healthy, storage: "kv" }, { ...healthy, hasDurableObject: false }, { ...healthy, status: "unconfigured" }])
    await assert.rejects(verifyRelease({ target: "worker", revision, attempts: 1, fetcher: async () => Response.json(body) }));
});

test("release propagation retries stale revisions and outages, then fails if the commit never appears", async () => {
  let calls = 0, waits = 0;
  await verifyRelease({ target: "worker", revision, attempts: 3, wait: async () => { waits++; }, fetcher: async () => {
    calls++;
    if (calls === 1) return new Response("Unavailable", { status: 503 });
    return Response.json(calls === 2 ? { ...healthy, revision: "old" } : healthy);
  } });
  assert.equal(calls, 3);
  assert.equal(waits, 2);
  await assert.rejects(verifyRelease({ target: "worker", revision, attempts: 2, wait: async () => {}, fetcher: async () => { throw new Error("Offline"); } }), /Offline/);
});

test("Pages verification preserves project subpaths and checks both commit and API connection", async () => {
  await verifyRelease({ target: "pages", revision, siteURL: "https://example.github.io/osrs-hiscores", workerURL: "https://worker.example", fetcher: async url => {
    assert.equal(url.pathname, "/osrs-hiscores/release.json");
    return Response.json({ revision, apiBase: "https://worker.example" });
  } });
  await assert.rejects(verifyRelease({ target: "pages", revision, siteURL: "https://example.github.io/", workerURL: "https://worker.example", attempts: 1,
    fetcher: async () => Response.json({ revision, apiBase: "https://other-worker.example" }) }), /different Worker/);
});

test("Pages packaging bundles all entry points with a shared Worker origin and release manifest", () => {
  const output = mkdtempSync(join(tmpdir(), "hiscores-release-"));
  try {
    const packager = new URL("./prepare-pages.mjs", import.meta.url).href;
    const { status, stderr } = spawnSync(process.execPath, [
      "--input-type=module", "-e", `import { preparePages } from ${JSON.stringify(packager)}; await preparePages(process.argv[1]);`, output,
    ], {
      env: { ...process.env, RELEASE_SHA: revision, WORKER_BASE_URL: "https://worker.example/api" },
      encoding: "utf8",
    });
    assert.equal(status, 0, stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(output, "release.json"), "utf8")), { revision, apiBase: "https://worker.example" });
    for (const page of ["index.html", "skill-hiscores.html", "achievements.html"]) {
      const html = readFileSync(join(output, page), "utf8");
      const script = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
      const stylesheet = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
      assert.ok(html.includes('id="app"') && script && stylesheet);
      assert.ok(readFileSync(join(output, script), "utf8").includes("https://worker.example"));
      assert.ok(readFileSync(join(output, stylesheet), "utf8").length);
      assert.ok(readFileSync(join(output, "frontend", page), "utf8").includes("location.replace"));
    }
  } finally { rmSync(output, { recursive: true, force: true }); }
});
