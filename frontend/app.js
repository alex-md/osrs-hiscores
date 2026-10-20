import { UPDATE_MINUTES } from "./lib/simulation-config.js";
import { SKILLS, SKILL_SYMBOLS, title } from "./lib/domain.js";
import { request, apiBase, saveBase, latestGeneration } from "./lib/api.js";

const $ = (selector) => document.querySelector(selector);
const number = (value) =>
  new Intl.NumberFormat("en-US").format(Number(value) || 0);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const playerLink = (name) => `#user/${encodeURIComponent(name)}`;
const date = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not recorded";
const skillIcon = (skill) =>
  `<span class="skill-symbol" aria-hidden="true">${SKILL_SYMBOLS[SKILLS.indexOf(skill)] || "◈"}</span>`;
const crest = `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 2 44 11v18C44 42 24 53 24 53S4 42 4 29V11Z"/><path d="m17 18 14 20m-14 0 14-20M12 34l9 7m6 0 9-7"/></svg>`;
const state = {
  catalog: [],
  catalogFetchedAt: 0,
  users: null,
  request: null,
  route: null,
  revision: 0,
};

function route() {
  const raw = location.hash.slice(1);
  if (raw.startsWith("user/")) {
    try {
      return { type: "player", username: decodeURIComponent(raw.slice(5)) };
    } catch {
      return { type: "invalid" };
    }
  }
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  if (
    path === "achievements" ||
    (!raw && location.pathname.endsWith("achievements.html"))
  )
    return { type: "achievements", params };
  if (
    path.startsWith("skills/") ||
    (!raw && location.pathname.endsWith("skill-hiscores.html"))
  ) {
    const skill =
      path.slice(7) ||
      new URLSearchParams(location.search).get("skill") ||
      "attack";
    return {
      type: SKILLS.includes(skill) ? "skill" : "invalid",
      skill,
      params,
    };
  }
  if (path && path !== "overall") return { type: "invalid" };
  return { type: "overall", params };
}
function layout() {
  $("#app").innerHTML = `
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="#overall">${crest}<span><strong>OSRS <span>Hiscores</span></strong><small>The adventurer’s ledger</small></span></a>
      <nav aria-label="Main navigation"><a data-nav="overall" href="#overall">Rankings</a><a data-nav="achievements" href="#achievements">Achievements</a></nav>
      <div class="header-actions"><form id="player-search" role="search"><label class="sr-only" for="search">Find a player</label><span aria-hidden="true">⌕</span><input id="search" placeholder="Find a player…" maxlength="12" autocomplete="off" list="player-names"><datalist id="player-names"></datalist><button class="sr-only" type="submit">Find player</button></form><button class="icon-button" id="theme" aria-label="Switch color theme" title="Switch color theme">◐</button></div>
    </div></header>
    <main class="workspace" id="content" tabindex="-1">
      <aside class="sidebar"><div class="sidebar-label">Hiscores</div><a class="sidebar-link" data-skill="overall" href="#overall"><span aria-hidden="true">♜</span> Overall <span class="link-arrow">↗</span></a>
        <div class="sidebar-label skill-heading">Skills <span>${SKILLS.length}</span></div><nav class="skill-nav" aria-label="Skill rankings">${SKILLS.map((s) => `<a class="sidebar-link" data-skill="${s}" href="#skills/${s}">${skillIcon(s)}${title(s)}</a>`).join("")}</nav>
        <div class="simulation-note"><span class="status-dot"></span><strong>A living simulation</strong><p>Accounts progress every 15 minutes. All players and scores are simulated.</p></div>
      </aside>
      <div class="main-content"><div id="view" aria-live="polite"></div></div>
    </main>
    <footer class="site-footer"><span>OSRS Hiscores <span class="footer-separator">/</span> An independent fan project. Not affiliated with Jagex.</span><button id="connection">Connection settings ↗</button></footer>
    <dialog id="settings"><form id="settings-form"><div class="dialog-heading"><h2>Connection settings</h2><button type="button" id="close-settings" class="icon-button" aria-label="Close settings">×</button></div><p>Use the API on this site, or connect to a separate hiscores Worker.</p><label for="base">Worker URL</label><input type="url" id="base" placeholder="Leave blank for the default connection"><p class="field-help">Example: https://your-worker.workers.dev</p><p class="form-error" id="settings-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button subtle" id="reset-base">Use default</button><button class="button primary">Save connection</button></div></form></dialog>`;
  $(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    $("#content").focus();
    $("#content").scrollIntoView();
  });
  $("#theme").addEventListener("click", () => {
    const value =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem("theme", value);
    } catch {
      /* Optional. */
    }
  });
  $("#player-search").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#search").value.trim();
    if (name) {
      location.hash = playerLink(name);
      $("#search").value = "";
    }
  });
  $("#search").addEventListener("focus", async () => {
    if (state.users) return;
    try {
      const data = await request("/api/users");
      state.users = data.users;
      $("#player-names").innerHTML = data.users
        .map((u) => `<option value="${escape(u)}"></option>`)
        .join("");
    } catch {
      /* Direct player lookup still works. */
    }
  });
  $("#connection").addEventListener("click", () => {
    $("#base").value = apiBase();
    $("#settings-error").textContent = "";
    $("#settings").showModal();
  });
  $("#close-settings").addEventListener("click", () => $("#settings").close());
  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    changeBase($("#base").value);
  });
  $("#reset-base").addEventListener("click", () => changeBase(""));
}
function changeBase(value) {
  try {
    saveBase(value);
    const url = new URL(location.href);
    url.searchParams.delete("api");
    history.replaceState(null, "", url);
    state.users = null;
    state.catalog = [];
    $("#player-names").innerHTML = "";
    $("#settings").close();
    renderRoute();
  } catch (error) {
    $("#settings-error").textContent = error.message;
  }
}
function pageHeading(eyebrow, heading, description, extra = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p>${description}</p></div>${extra}</div>`;
}
function loading() {
  return `<div class="loading-state" role="status"><span class="spinner"></span> Reading the ledger…</div>`;
}
function errorView(error) {
  $("#view").innerHTML =
    `${pageHeading("Hiscores", "Unable to load the ledger", "Your place in the rankings is still here.")}<div class="empty-state error-state"><span aria-hidden="true">◈</span><h2>Let’s reconnect</h2><p>${escape(error.message)}</p><div class="action-row"><button class="button primary" id="retry">Try again</button><button class="button subtle" id="error-connection">Connection settings</button></div></div>`;
  $("#retry").addEventListener("click", renderRoute);
  $("#error-connection").addEventListener("click", () =>
    $("#connection").click(),
  );
}
function stats(items, className = "") {
  return `<div class="stat-strip ${className}">${items.map(([label, value, suffix = ""]) => `<div class="stat"><span>${label}</span><strong>${value}${suffix ? `<small>${suffix}</small>` : ""}</strong></div>`).join("")}</div>`;
}
function markUpdated(data) {
  return `<span class="updated"><span class="status-dot"></span> Updated ${date(data.generatedAt)}${data.training ? ` · ${data.training.scale}× XP world` : ""}</span>`;
}
function tierBadge(tier) {
  return `<span class="tier-badge ${["Grandmaster", "Master", "Diamond"].includes(tier) ? "prestige" : ""}">${escape(tier || "Novice")}</span>`;
}
function pager(data) {
  return `<div class="pagination"><span>${data.total ? `${number((data.page - 1) * data.limit + 1)}–${number(Math.min(data.page * data.limit, data.total))} of ${number(data.total)}` : "No matching players"}</span><div><button class="button subtle" id="previous" ${data.page <= 1 ? "disabled" : ""} aria-label="Previous page">←</button><span>Page ${number(data.page)} of ${number(data.pages)}</span><button class="button subtle" id="next" ${data.page >= data.pages ? "disabled" : ""} aria-label="Next page">→</button></div></div>`;
}
function updateQuery(values) {
  const current = state.route;
  const params = new URLSearchParams(current.params);
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === null) params.delete(key);
    else params.set(key, value);
  }
  const path = current.type === "skill" ? `skills/${current.skill}` : "overall";
  location.hash = `${path}${params.size ? `?${params}` : ""}`;
}
function bindPagination(data) {
  $("#previous")?.addEventListener("click", () =>
    updateQuery({ page: data.page - 1 }),
  );
  $("#next")?.addEventListener("click", () =>
    updateQuery({ page: data.page + 1 }),
  );
}
function rankCell(rank) {
  return `<td class="rank ${rank <= 3 ? "top-rank" : ""}">${String(rank).padStart(2, "0")}${rank === 1 ? '<span aria-label="First place">♛</span>' : ""}</td>`;
}
function rankTable(rows, skill) {
  const cols = skill ? 4 : 5;
  return `<div class="table-scroll"><table><thead><tr><th scope="col">Rank</th><th scope="col">Player</th>${skill ? '<th scope="col" class="numeric">Level</th><th scope="col" class="numeric">Experience</th>' : '<th scope="col">Prestige</th><th scope="col" class="numeric">Total level</th><th scope="col" class="numeric">Total XP</th>'}</tr></thead><tbody>${rows.length ? rows.map((u) => `<tr>${rankCell(u.rank)}<td><a class="player-link" href="${playerLink(u.username)}"><span class="player-avatar" aria-hidden="true">${escape(u.username.slice(0, 1))}</span>${escape(u.username)}<span class="row-arrow" aria-hidden="true">↗</span></a></td>${skill ? `<td class="numeric level">${number(u.level)}</td><td class="numeric">${number(u.xp)}</td>` : `<td>${tierBadge(u.tier)}</td><td class="numeric level">${number(u.totalLevel)}</td><td class="numeric">${number(u.totalXP)}</td>`}</tr>`).join("") : `<tr><td colspan="${cols}" class="table-empty"><h3>No players found</h3><p>Try a different name or clear the filters.</p></td></tr>`}</tbody></table></div>`;
}
async function rankingView(current, signal, revision) {
  const skill = current.type === "skill" ? current.skill : null;
  const params = new URLSearchParams(current.params);
  params.set("limit", params.get("limit") || "25");
  if (skill) params.set("skill", skill);
  const data = await request(
    `/api/${skill ? "skill-rankings" : "leaderboard"}?${params}`,
    { signal },
  );
  if (revision !== state.revision) return;
  const leader = data.players[0];
  const search = current.params.get("q") || "";
  $("#view").innerHTML = `<section class="rankings-page">
    ${pageHeading(skill ? `Skill hiscores / ${title(skill)}` : "The world rankings", skill ? `${skillIcon(skill)}${title(skill)} hiscores` : "Overall hiscores", skill ? `Follow the ${title(skill).toLowerCase()} ladder, from the first level to 200 million XP.` : "A living world of skillers, grinders, and the occasional bank stander.", `<div class="edition-stamp">${crest}<span>Old School<br><strong>RuneScape</strong></span></div>`)}
    ${stats([
      ["Adventurers", number(data.totalPlayers)],
      [
        skill ? "Top skill level" : "Top total level",
        leader ? number(skill ? leader.level : leader.totalLevel) : "—",
        skill ? "/ 99" : "/ 2,277",
      ],
      ["Simulation cycle", number(data.training?.updateMinutes || UPDATE_MINUTES), "min"],
    ], "ranking-summary")}
    ${data.legacy && data.coverage < data.totalPlayers ? `<p class="coverage-note">This connection provides the top ${number(data.coverage)} ${skill ? title(skill).toLowerCase() : "overall"} players. Update the Worker for complete rankings.</p>` : ""}
    <section class="panel ranking-panel"><div class="panel-heading"><div><div class="eyebrow">${skill ? "The skill ladder" : "The overall ladder"}</div><h2>${skill ? title(skill) : "Overall"} rankings</h2></div>${markUpdated(data)}</div>
      <form class="filter-bar" id="filters"><label class="search-filter"><span class="sr-only">Filter players</span><span aria-hidden="true">⌕</span><input name="q" placeholder="Filter by player name" value="${escape(search)}" maxlength="12"></label>
      ${skill ? `<label>Min level<input name="minLevel" type="number" min="1" max="99" placeholder="1" value="${escape(params.get("minLevel") || "")}"></label><label>Max level<input name="maxLevel" type="number" min="1" max="99" placeholder="99" value="${escape(params.get("maxLevel") || "")}"></label><details class="xp-filters"><summary>XP range</summary><div><label>Min XP<input name="minXP" type="number" min="0" max="200000000" value="${escape(params.get("minXP") || "")}"></label><label>Max XP<input name="maxXP" type="number" min="0" max="200000000" value="${escape(params.get("maxXP") || "")}"></label></div></details>` : ""}
      <label>Rows<select name="limit">${[25, 50, 100].map((n) => `<option value="${n}" ${data.limit === n ? "selected" : ""}>${n}</option>`).join("")}</select></label><button class="button primary">Apply</button><button class="button subtle" type="button" id="clear-filters">Reset</button></form>
      ${rankTable(data.players, skill)}${pager(data)}
    </section><div class="below-table"><p>${skill ? "Ranks are ordered by XP. Ties are settled by player name." : "Ranks are ordered by total level, then total XP, then player name."}</p><button id="export" class="text-button">↓ Export this page</button></div>
    <section class="ledger-note"><span aria-hidden="true">✦</span><div><h3>The next chapter is always being written.</h3><p>Every 15 minutes, adventurers choose whether to train at skill-specific rates with 3.5× XP, and new accounts join the world. Open any player to explore their skills and recorded achievements.</p></div><a href="#achievements">Explore achievements ↗</a></section></section>`;
  $("#filters").addEventListener("submit", (event) => {
    event.preventDefault();
    updateQuery({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      page: "",
    });
  });
  $("#clear-filters").addEventListener("click", () => {
    location.hash = skill ? `skills/${skill}` : "overall";
  });
  $("#export").addEventListener("click", () => exportCSV(data.players, skill));
  bindPagination(data);
}
function exportCSV(rows, skill) {
  const keys = skill
    ? ["rank", "username", "level", "xp"]
    : ["rank", "username", "tier", "totalLevel", "totalXP"];
  const quote = (value) =>
    `"${String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const csv = [
    keys.join(","),
    ...rows.map((u) => keys.map((k) => quote(u[k])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${skill || "overall"}-hiscores.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
async function loadCatalog(signal) {
  if (state.catalog.length && Date.now() - state.catalogFetchedAt < 30000)
    return state.catalog;
  const data = await request("/api/achievements/catalog", { signal });
  state.catalog = data.achievements;
  state.catalogFetchedAt = Date.now();
  return state.catalog;
}
function achievementCard(item, unlockedAt) {
  return `<article class="achievement-card ${escape(item.rarity)}"><div class="achievement-top"><span class="achievement-glyph" aria-hidden="true">${item.category === "Mastery" ? "✧" : item.category === "Competition" ? "♛" : "◈"}</span><span class="rarity">${title(item.rarity)}</span></div><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><div class="achievement-foot"><span>${unlockedAt ? `Unlocked ${date(unlockedAt)}` : `${number(item.count)} unlocked · ${item.pct < 0.01 && item.count ? "<0.01" : item.pct.toFixed(2)}%`}</span>${!unlockedAt && item.first ? `<a href="${playerLink(item.first.username)}" title="First recorded unlock">First: ${escape(item.first.username)} ↗</a>` : ""}</div></article>`;
}
async function playerView(current, signal, revision) {
  const [user, achievements] = await Promise.all([
    request(`/api/users/${encodeURIComponent(current.username)}`, { signal }),
    loadCatalog(signal),
  ]);
  if (revision !== state.revision) return;
  const byKey = new Map(achievements.map((a) => [a.key, a]));
  const unlocked = Object.entries(user.achievements || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const mastered = SKILLS.filter((s) => user.skills[s].level === 99).length;
  $("#view").innerHTML =
    `<article class="adventurer-profile"><a class="back-link" href="#overall">← Back to rankings</a>
    ${pageHeading("Adventurer profile", escape(user.username), `${escape(title(user.archetype || "Casual"))} · Joined ${user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "date unknown"}`, `<div class="profile-emblem">${crest}${tierBadge(user.tier)}</div>`)}
    ${stats([
      ["Overall rank", user.rank ? `#${number(user.rank)}` : "Unranked"],
      ["Total level", number(user.totalLevel), "/ 2,277"],
      ["Total experience", number(user.totalXP)],
      ["Combat level", number(user.combatLevel), "/ 126"],
    ], "profile-summary")}
    <div class="profile-notes">${user.progress?.lastSession ? `<p class="profile-updated">Latest session: ${escape(title(user.progress.lastSession.skill))} · +${number(user.progress.lastSession.gainedXP)} XP · ${number(user.progress.sessions)} sessions recorded · Best session: ${number(user.progress.bestSessionXP)} XP</p>` : ""}
    ${user.goal ? `<p class="profile-updated">Next skill cape: ${escape(title(user.goal.skill))} · ${number(user.goal.remainingXP)} XP remaining · about ${number(Math.ceil(user.goal.trainingHours))} active training hours at the current rate (${user.training?.scale || 3.5}× world). Rates increase as levels unlock methods.</p>` : ""}
    </div><section class="panel skills-panel"><div class="panel-heading"><h2>Skills & experience</h2><span class="updated">${mastered} of ${SKILLS.length} skills mastered</span></div>
    <div class="skill-book"><table class="profile-skills-table"><colgroup><col class="skill-name-column"><col class="skill-level-column"><col><col class="skill-rank-column"></colgroup><thead><tr><th scope="col">Skill</th><th scope="col" class="numeric">Level</th><th scope="col" class="numeric">XP</th><th scope="col" class="numeric">Rank</th></tr></thead><tbody>${SKILLS.map((s) => {
      const stat = user.skills[s];
      return `<tr class="${stat.level === 99 ? "mastered" : ""}"><th scope="row"><a class="skill-row-link" href="#skills/${s}">${skillIcon(s)}<strong>${title(s)}</strong></a></th><td class="numeric skill-level">${stat.level}</td><td class="numeric skill-xp">${number(stat.xp)}</td><td class="numeric skill-rank ${user.ranks[s] ? "" : "unlisted"}">${user.ranks[s] ? `#${number(user.ranks[s])}` : "Not listed"}</td></tr>`;
    }).join("")}</tbody></table></div></section>
    <section class="profile-achievements"><div class="section-heading"><div><div class="eyebrow">Recorded milestones</div><h2>Achievement collection <span class="count-label">${unlocked.length}</span></h2></div><a href="#achievements">View the catalog ↗</a></div>
      <div id="profile-unlocks" class="achievement-grid">${
        unlocked.length
          ? unlocked
              .slice(0, 12)
              .map(([key, timestamp]) =>
                achievementCard(
                  byKey.get(key) || {
                    name: title(key),
                    description:
                      "A historical unlock recorded on this account.",
                    category: "Progression",
                    rarity: "common",
                  },
                  timestamp,
                ),
              )
              .join("")
          : '<div class="empty-state"><h3>A fresh page</h3><p>This player has no recorded achievements yet. Check back after the next simulation cycle.</p></div>'
      }</div>${unlocked.length > 12 ? `<div class="collection-controls"><span id="collection-count">Showing 12 of ${unlocked.length}</span><button id="expand-collection" class="button subtle" aria-expanded="false">Show all achievements</button></div>` : ""}</section>
    <p class="profile-updated">Player last active ${date(user.updatedAt)} · Rankings updated ${date(user.generatedAt)}</p></article>`;
  $("#expand-collection")?.addEventListener("click", (event) => {
    const expanded =
      event.currentTarget.getAttribute("aria-expanded") !== "true";
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded
      ? "Show recent achievements"
      : "Show all achievements";
    $("#collection-count").textContent =
      `Showing ${expanded ? unlocked.length : 12} of ${unlocked.length}`;
    $("#profile-unlocks").innerHTML = (
      expanded ? unlocked : unlocked.slice(0, 12)
    )
      .map(([key, timestamp]) =>
        achievementCard(
          byKey.get(key) || {
            name: title(key),
            description: "A historical unlock recorded on this account.",
            category: "Progression",
            rarity: "common",
          },
          timestamp,
        ),
      )
      .join("");
  });
}
async function achievementsView(current, signal, revision) {
  const [items, statsData, banners] = await Promise.all([
    loadCatalog(signal),
    request("/api/achievements/stats", { signal }),
    request("/api/banners/rare", { signal }),
  ]);
  if (revision !== state.revision) return;
  const claimed = items.filter((a) => a.count > 0).length;
  $("#view").innerHTML =
    `${pageHeading("Milestones & mastery", "Great feats.<br>Lasting records.", "Discover the milestones that define an account, and the adventurers who reached them first.", `<div class="edition-stamp">${crest}<span>The hall of<br><strong>Achievements</strong></span></div>`)}
    ${stats([
      ["Achievements", number(items.length)],
      ["Claimed milestones", number(claimed)],
      ["Recorded firsts", number(items.filter((a) => a.first).length)],
      ["Adventurers", number(statsData.totalPlayers)],
    ])}
    ${
      banners.length
        ? `<section class="recent-records"><div class="section-heading"><div><div class="eyebrow">In the last 48 hours</div><h2>Fresh ink in the ledger</h2></div></div><div class="record-list">${banners
            .slice(0, 3)
            .map(
              (b) =>
                `<a class="record" href="${playerLink(b.username)}"><span aria-hidden="true">✦</span><div><strong>${escape(b.username)}</strong><p>${escape(b.name)}</p></div><time datetime="${new Date(b.timestamp).toISOString()}">${date(b.timestamp)}</time><span aria-hidden="true">↗</span></a>`,
            )
            .join("")}</div></section>`
        : ""
    }
    <section class="panel catalog-panel"><div class="panel-heading"><div><div class="eyebrow">The collection</div><h2>Achievement catalog</h2></div><span class="updated">Rarity follows recorded unlocks</span></div>
    <form class="filter-bar" id="catalog-filters"><label class="search-filter"><span class="sr-only">Search achievements</span><span aria-hidden="true">⌕</span><input id="achievement-search" placeholder="Search milestones…"></label><label>Category<select id="category"><option value="">All categories</option>${["Competition", "Progression", "Mastery", "Playstyle"].map((c) => `<option>${c}</option>`).join("")}</select></label><label>Rarity<select id="rarity"><option value="">All rarities</option>${["mythic", "legendary", "epic", "rare", "uncommon", "common", "unclaimed"].map((r) => `<option value="${r}">${title(r)}</option>`).join("")}</select></label><label>Sort<select id="sort"><option value="name">Name</option><option value="rarest">Rarest first</option><option value="popular">Most unlocked</option></select></label></form><div id="catalog-results" class="catalog-results"></div></section>
    <p class="below-table">Firsts show the earliest recorded unlock. Unclaimed milestones have no unlocks yet.</p>`;
  const render = () => {
    const query = $("#achievement-search").value.toLowerCase(),
      category = $("#category").value,
      tier = $("#rarity").value;
    const filtered = items.filter(
      (a) =>
        (!query ||
          `${a.name} ${a.description}`.toLowerCase().includes(query)) &&
        (!category || a.category === category) &&
        (!tier || a.rarity === tier),
    );
    const sort = $("#sort").value;
    filtered.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (sort === "popular"
            ? b.count - a.count
            : (a.count || Infinity) - (b.count || Infinity)) ||
          a.name.localeCompare(b.name),
    );
    $("#catalog-results").innerHTML =
      `<p class="result-count">${filtered.length} achievements</p><div class="achievement-grid">${filtered.length ? filtered.map((a) => achievementCard(a)).join("") : '<div class="empty-state"><h3>No matching achievements</h3><p>Try another search or choose all categories.</p></div>'}</div>`;
  };
  $("#catalog-filters").addEventListener("submit", (e) => e.preventDefault());
  $("#catalog-filters").addEventListener("input", render);
  render();
}
async function renderRoute() {
  state.request?.abort();
  state.request = new AbortController();
  const revision = ++state.revision;
  const current = route();
  state.route = current;
  document.title = `${current.type === "player" ? current.username : current.type === "skill" ? `${title(current.skill)} hiscores` : current.type === "achievements" ? "Achievements" : "Rankings"} · OSRS Hiscores`;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active =
      a.dataset.nav ===
      (current.type === "achievements" ? "achievements" : "overall");
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-skill]").forEach((a) => {
    const active =
      a.dataset.skill ===
      (current.type === "skill"
        ? current.skill
        : current.type === "overall"
          ? "overall"
          : null);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#view").innerHTML = loading();
  try {
    if (current.type === "invalid")
      throw new Error(
        "This page does not exist. Use the navigation to return to the rankings.",
      );
    if (current.type === "overall" || current.type === "skill")
      await rankingView(current, state.request.signal, revision);
    else if (current.type === "player")
      await playerView(current, state.request.signal, revision);
    else await achievementsView(current, state.request.signal, revision);
    if (revision === state.revision) displayedGeneration = latestGeneration;
  } catch (error) {
    if (revision !== state.revision || state.request.signal.aborted) return;
    errorView(
      error.name === "TimeoutError"
        ? new Error("The service took too long to respond. Try again.")
        : error,
    );
  }
}
let displayedGeneration = null;
let checkingWorld = false;
async function checkWorld() {
  if (document.hidden || checkingWorld) return;
  checkingWorld = true;
  try {
    const world = await request("/api/world");
    if (
      displayedGeneration &&
      world.generation !== displayedGeneration &&
      !document.activeElement?.matches("input, select, textarea")
    ) {
      state.catalog = [];
      state.users = null;
      await renderRoute();
    }
  } catch {
    /* Keep the last successful view during temporary network failures. */
  } finally {
    checkingWorld = false;
  }
}
setInterval(checkWorld, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkWorld();
});
layout();
window.addEventListener("hashchange", renderRoute);
renderRoute();
