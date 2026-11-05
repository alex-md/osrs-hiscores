import { SKILLS, title } from "./domain.js";

export function route(location) {
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
  if (path === "stories") return { type: "stories", params };
  if (path === "progress") return { type: "progress", params };
  if (["bosses", "wealth"].includes(path))
    return { type: "activity", path, params };
  if (path && path !== "overall") return { type: "invalid" };
  return { type: "overall", params };
}
const PAGE_TITLES = {
  stories: "World stories",
  progress: "Gains & records",
  achievements: "Achievements",
};
const ACTIVITY_TITLES = { wealth: "Bank value hiscores", bosses: "Boss hiscores" };

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
