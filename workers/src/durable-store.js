// JSON documents live in SQLite inside one Durable Object. This interface keeps
// the ranking/domain code independent of Cloudflare APIs; it is not Workers KV.
export class DurableStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.pending = new Map();
  }
  async get(key, type) {
    if (Array.isArray(key)) {
      const result = new Map();
      for (const name of key) result.set(name, await this.get(name, type));
      return result;
    }
    const raw = this.pending.has(key)
      ? this.pending.get(key)
      : this.sql.exec("SELECT value FROM documents WHERE key = ?", key).toArray()[0]?.value ?? null;
    return raw !== null && type === "json" ? JSON.parse(raw) : raw;
  }
  async put(key, value) {
    this.pending.set(key, value);
  }
  async delete(key) {
    this.pending.set(key, null);
  }
  commit() {
    if (!this.pending.size) return;
    this.storage.transactionSync(() => {
      for (const [key, value] of this.pending)
        if (value === null) this.sql.exec("DELETE FROM documents WHERE key = ?", key);
        else this.sql.exec("INSERT INTO documents (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
      const manifest = this.pending.get("snapshot:current");
      if (manifest) {
        const { generation } = JSON.parse(manifest);
        const prefix = `snapshot:${generation}:`;
        this.sql.exec("DELETE FROM documents WHERE substr(key, 1, 9) = 'snapshot:' AND key != 'snapshot:current' AND substr(key, 1, ?) != ?", prefix.length, prefix);
      }
    });
    this.pending.clear();
  }
  rollback() {
    this.pending.clear();
  }
}
