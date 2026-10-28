import { flushHistory } from "./history.js";
import { DurableStore } from "./durable-store.js";
import { handleApiRequest, runScheduled } from "./index.js";
import { json, HttpError } from "./http.js";
import { emitExchangeTelemetry } from "./telemetry.js";

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
        // Capture only this job's staged exchange, without another SQL read.
        // A rebuild/read has none; retries and failed commits emit no points.
        const exchange = this.store.pending.get("system:exchange");
        const snapshot = this.store.pending.get("snapshot:current");
        this.store.commit();
        emitExchangeTelemetry(this.env, exchange, snapshot);
      } else this.store.rollback();
      if (request.method === "POST") {
        try { await flushHistory(this.env); }
        catch (error) {
          this.store.rollback();
          console.error("History publication deferred; world commit preserved:", error);
        }
      }
      return response;
    } catch (error) {
      this.store.rollback();
      if (!(error instanceof HttpError)) console.error("World operation failed:", error);
      return json({ error: error instanceof HttpError ? error.message : "World update failed. No database changes were committed." }, error.status || 503);
    }
  }
}
