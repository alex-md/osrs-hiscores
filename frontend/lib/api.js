import { catalog } from "./catalog.js";
import { combatLevel } from "./domain.js";

const KEY = "osrs-api-base";
export const LEGACY_WORKER = "https://osrs-hiscores-clone.vs.workers.dev";
let override = "";
try {
  override = localStorage.getItem(KEY) || localStorage.getItem("apiBase") || "";
} catch {
  /* Storage is optional. */
}
const supplied = new URLSearchParams(location.search).get("api");
export function validateBase(value) {
  if (!value?.trim()) return "";
  const url = new URL(value.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP or HTTPS origin without credentials, query parameters or a fragment.",
    );
  return url.href.replace(/\/$/, "").replace(/\/api$/, "");
}
try {
  if (supplied !== null) override = validateBase(supplied);
  else override = validateBase(override);
} catch {
  override = "";
}
// GitHub Pages cannot execute Functions. Cloudflare and local development use same-origin API.
const hostedBase =
  globalThis.HISCORES_CONFIG?.apiBase ||
  (location.hostname.endsWith(".github.io") ? LEGACY_WORKER : "");
export const apiBase = () => override || hostedBase;
export function saveBase(value) {
  const base = validateBase(value);
  try {
    localStorage.setItem(KEY, base);
    localStorage.removeItem("apiBase");
  } catch {
    /* Still allow session use. */
  }
  override = base;
}
async function fetchJSON(path, { signal } = {}) {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(`${apiBase()}${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { accept: "application/json" },
  });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json"))
    throw new Error(
      "The hiscores API is not connected. Open Connection settings to select your Worker.",
    );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error || `The service returned ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

// Transitional reader for v1 Workers, keeping the site usable during deployment.
export async function request(path, options = {}) {
  const url = new URL(path, location.origin);
  let data;
  try {
    data = await fetchJSON(path, options);
  } catch (error) {
    if (url.pathname !== "/api/achievements/catalog" || error.status !== 404)
      throw error;
    const [stats, firsts] = await Promise.all([
      fetchJSON("/api/achievements/stats", options),
      fetchJSON("/api/achievements/firsts", options),
    ]);
    return {
      achievements: catalog(stats.counts, stats.totalPlayers, firsts.firsts),
      totalPlayers: stats.totalPlayers,
    };
  }
  const params = url.searchParams;
  if (
    (url.pathname === "/api/leaderboard" ||
      url.pathname === "/api/skill-rankings") &&
    !data.page
  ) {
    const skill = params.get("skill");
    if (url.pathname === "/api/skill-rankings" && !skill) return data;
    if (url.pathname === "/api/leaderboard")
      data = await fetchJSON("/api/leaderboard?limit=5000", options);
    let rows = skill ? data.rankings[skill] || [] : data.players || [];
    const coverage = rows.length;
    const query = (params.get("q") || "").trim().toLowerCase();
    if (query)
      rows = rows.filter((u) => u.username.toLowerCase().includes(query));
    if (skill) {
      const min = Number(params.get("minLevel") || 1),
        max = Number(params.get("maxLevel") || 99);
      const minXP = Number(params.get("minXP") || 0),
        maxXP = Number(params.get("maxXP") || 200000000);
      if (min > max || minXP > maxXP)
        throw new Error("Minimum filters must not exceed maximum filters.");
      rows = rows.filter(
        (u) =>
          u.level >= min && u.level <= max && u.xp >= minXP && u.xp <= maxXP,
      );
    }
    const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 25));
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    const page = Math.max(1, Math.min(pages, Number(params.get("page")) || 1));
    return {
      ...data,
      legacy: true,
      coverage,
      limit,
      pages,
      page,
      total: rows.length,
      players: rows.slice((page - 1) * limit, page * limit),
    };
  }
  if (
    /^\/api\/users\/[^/]+$/.test(url.pathname) &&
    url.pathname !== "/api/users/batch" &&
    !data.ranks
  ) {
    const [overall, skills] = await Promise.all([
      fetchJSON("/api/leaderboard?limit=5000", options),
      fetchJSON("/api/skill-rankings", options),
    ]);
    const match = (row) =>
      row.username.toLowerCase() === data.username.toLowerCase();
    const ranked = overall.players.find(match);
    return {
      ...data,
      rank: ranked?.rank || null,
      tier: ranked?.tier || "Novice",
      combatLevel: combatLevel(data.skills),
      ranks: Object.fromEntries(
        Object.entries(skills.rankings).map(([s, rows]) => [
          s,
          rows.find(match)?.rank || null,
        ]),
      ),
      generatedAt: overall.generatedAt,
    };
  }
  if (url.pathname === "/api/banners/rare")
    return data.map((b) => ({
      ...b,
      name:
        b.name || b.title || b.message || b.description || "A new milestone",
      timestamp: b.timestamp || b.ts || Date.now(),
    }));
  return data;
}
