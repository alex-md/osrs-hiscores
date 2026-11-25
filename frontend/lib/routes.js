import { SKILLS, title } from "./domain.js";

export function route(location) {
  const raw = location.hash.slice(1);
  if (raw.startsWith("user/")) {
    try {
      const [name,query] = raw.slice(5).split("?");
      return { type: "player", username: decodeURIComponent(name), ...(query ? {params:new URLSearchParams(query)} : {}) };
    } catch {
      return { type: "invalid" };
    }
  }
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const page = location.pathname.replace(/\/$/, "").split("/").pop().replace(/\.html$/, "");
  if (
    path === "achievements" ||
    (!raw && page === "achievements")
  )
    return { type: "achievements", params };
  if (
    path.startsWith("skills/") ||
    (!raw && page === "skill-hiscores")
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
  if (path === "festival" || path === "discoveries") return {type:"stories",params};
  if (path === "collections") return { type: path, params };
  if (path === "world") return { type: "world", params };
  if (path === "economy") return { type: "economy", params };
  if (path === "stories") return { type: "stories", params };
  if (path === "progress") return { type: "progress", params };
  if (["bosses", "wealth"].includes(path))
    return { type: "activity", path, params };
  if (path && path !== "overall") return { type: "invalid" };
  return { type: "overall", params };
}
const PAGE_TITLES = {
  collections: "Collection hall",
  world: "World watch",
  economy: "Item economy",
  stories: "World discoveries",
  progress: "Gains & records",
  achievements: "Achievements",
};
const ACTIVITY_TITLES = { wealth: "Wealth & fortunes", bosses: "Boss hiscores" };

export function routeTitle(current) {
  if (current.type === "player") return current.username;
  if (current.type === "skill") return `${title(current.skill)} hiscores`;
  if (current.type === "activity") return ACTIVITY_TITLES[current.path];
  return PAGE_TITLES[current.type] || "Rankings";
}

export function routeNavigation(current) {
  if (current.type === "activity") return current.path;
  return Object.hasOwn(PAGE_TITLES, current.type) ? current.type : "overall";
}
