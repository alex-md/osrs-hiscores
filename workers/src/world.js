import { readJSON, writeJSON } from './store.js';
import { flushHistory } from "./history.js";
import { DurableStore } from "./durable-store.js";
import { handleApiRequest, runScheduled } from "./index.js";
import { json, HttpError } from "./http.js";

export class HiscoresWorld {
  constructor(ctx, env) {
    this.store = new DurableStore(ctx.storage);
    this.env = { ...env, WORLD_STORE: this.store };
    // All reads and updates share this queue. A rejected job does not
    // poison later requests, and no asynchronous update can interleave another.
    this.queue = Promise.resolve();
  }
  fetch(request) {
    const job = this.queue.then(() => this.respond(request));
    this.queue = job.catch(() => {});
    return job;
  }
  async recordOperationFailure() {
    const operations = await readJSON(this.env, 'system:operations', {});
    await writeJSON(this.env, 'system:operations', {
      failures: (operations.failures || 0) + 1,
      lastFailedAt: Date.now(),
    });
    this.store.commit();
  }
  async respond(request) {
    try {
      const path = new URL(request.url).pathname;
      let response;
      if (path === "/internal/scheduled") {
        // Only the Worker can address this object; its public router never
        // forwards /internal paths.
        response = json(await runScheduled(this.env));
      } else {
        response = await handleApiRequest(request, this.env);
      }
      if (response.ok) {
        this.store.commit();
      } else {
        this.store.rollback();
        if (response.status >= 500 && request.method === 'POST') {
          await this.recordOperationFailure();
        }
      }
      if (request.method === "POST") {
        try { await flushHistory(this.env); }
        catch (error) {
          this.store.rollback();
          try {
            const publication = await readJSON(this.env, 'history:publication', {});
            await writeJSON(this.env, 'history:publication', { ...publication, failures:(publication.failures || 0)+1, lastFailedAt:Date.now() });
            this.store.commit();
          } catch { this.store.rollback(); }
          console.error("History publication deferred; world commit preserved:", error);
        }
      }
      return response;
    } catch (error) {
      this.store.rollback();
      if (!(error instanceof HttpError) && request.method === "POST") {
        try {
          await this.recordOperationFailure();
        } catch { this.store.rollback(); }
      }
      if (!(error instanceof HttpError)) console.error("World operation failed:", error);
      return json({ error: error instanceof HttpError ? error.message : "World update failed. No database changes were committed." }, error.status || 503);
    }
  }
}
