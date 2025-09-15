(function () {
  const qApi = new URLSearchParams(location.search).get("api");
  if (qApi) localStorage.setItem("apiBaseOverride", qApi);
  let apiBase = (localStorage.getItem("apiBaseOverride") || document.documentElement.getAttribute("data-api-base") || location.origin).replace(/\/$/, "");
  function setApiBase(newBase) {
    if (!newBase) return;
    apiBase = newBase.replace(/\/$/, "");
    localStorage.setItem("apiBaseOverride", apiBase);
    if (window.toast) try {
      toast("API base set to " + apiBase + " – reloading");
    } catch (_) { }
    setTimeout(() => location.reload(), 400);
  }
  function clearApiBase() {
    localStorage.removeItem("apiBaseOverride");
    if (window.toast) try {
      toast("API base override cleared – reloading");
    } catch (_) { }
    setTimeout(() => location.reload(), 400);
  }
  async function fetchJSON(path, init) {
    const url = apiBase + path;
    const resp = await fetch(url, init);
    if (!resp.ok) throw new Error("Request failed: " + resp.status + " " + resp.statusText);
    const ct = resp.headers.get("content-type") || "";
    const body = await resp.text();
    try {
      if (!ct.includes("application/json")) {
        if (/^\s*</.test(body)) throw new Error("Received HTML instead of JSON from " + url + " (point frontend to Worker API).");
        throw new Error("Unexpected content-type (" + ct + ") from " + url);
      }
      return JSON.parse(body);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Invalid JSON from " + url + " – first chars: " + body.slice(0, 60));
      throw e;
    }
  }
  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function el(tag, cls, children) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (children) children.forEach((c) => e.appendChild(c));
    return e;
  }
  function text(t) {
    return document.createTextNode(t);
  }
  function toast(msg, type = "info", timeout = 3000) {
    const container = $("#toastContainer");
    const div = el("div", type === "error" ? "toast toast--error" : "toast");
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), timeout);
  }
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    updateThemeToggle();
  }
  function toggleTheme() {
    const cur = localStorage.getItem("theme") || "dark";
    setTheme(cur === "light" ? "dark" : "light");
  }
  function updateThemeToggle() {
    const btn = $("#themeToggle");
    if (!btn) return;
    btn.innerHTML = "";
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", (localStorage.getItem("theme") || "dark") === "light" ? "moon" : "sun");
    btn.appendChild(icon);
    if (window.lucide) window.lucide.createIcons();
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (window.lucide) window.lucide.createIcons();
    updateThemeToggle();
    const skillRoot = document.getElementById("sidebarSkillList");
    if (skillRoot) populateSkillLinks(skillRoot);
  });
  window.API_BASE = apiBase;
  window.setApiBase = setApiBase;
  window.clearApiBase = clearApiBase;
  window.fetchJSON = fetchJSON;
  window.$ = $;
  window.el = el;
  window.text = text;
  window.toast = toast;
  window.setTheme = setTheme;
  window.toggleTheme = toggleTheme;
  window.updateThemeToggle = updateThemeToggle;
  const SKILLS = [
    "attack",
    "defence",
    "strength",
    "hitpoints",
    "ranged",
    "prayer",
    "magic",
    "cooking",
    "woodcutting",
    "fletching",
    "fishing",
    "firemaking",
    "crafting",
    "smithing",
    "mining",
    "herblore",
    "agility",
    "thieving",
    "slayer",
    "farming",
    "runecraft",
    "hunter",
    "construction"
  ];
  window.SKILLS = SKILLS;
  const SKILL_ICONS = {
    attack: "https://oldschool.runescape.wiki/images/thumb/f/fe/Attack_icon.png/21px-Attack_icon.png",
    defence: "https://oldschool.runescape.wiki/images/thumb/b/b8/Defence_icon.png/21px-Defence_icon.png",
    strength: "https://oldschool.runescape.wiki/images/thumb/1/1b/Strength_icon.png/21px-Strength_icon.png",
    hitpoints: "https://oldschool.runescape.wiki/images/thumb/8/8c/Hitpoints_icon.png/21px-Hitpoints_icon.png",
    ranged: "https://oldschool.runescape.wiki/images/thumb/1/19/Ranged_icon.png/21px-Ranged_icon.png",
    prayer: "https://oldschool.runescape.wiki/images/thumb/f/f2/Prayer_icon.png/21px-Prayer_icon.png",
    magic: "https://oldschool.runescape.wiki/images/thumb/5/5c/Magic_icon.png/21px-Magic_icon.png",
    cooking: "https://oldschool.runescape.wiki/images/thumb/4/43/Cooking_icon.png/21px-Cooking_icon.png",
    woodcutting: "https://oldschool.runescape.wiki/images/thumb/f/f4/Woodcutting_icon.png/21px-Woodcutting_icon.png",
    fletching: "https://oldschool.runescape.wiki/images/thumb/2/23/Fletching_icon.png/21px-Fletching_icon.png",
    fishing: "https://oldschool.runescape.wiki/images/thumb/0/05/Fishing_icon.png/21px-Fishing_icon.png",
    firemaking: "https://oldschool.runescape.wiki/images/thumb/9/9b/Firemaking_icon.png/21px-Firemaking_icon.png",
    crafting: "https://oldschool.runescape.wiki/images/thumb/0/06/Crafting_icon.png/21px-Crafting_icon.png",
    smithing: "https://oldschool.runescape.wiki/images/thumb/d/dd/Smithing_icon.png/21px-Smithing_icon.png",
    mining: "https://oldschool.runescape.wiki/images/thumb/4/4a/Mining_icon.png/21px-Mining_icon.png",
    herblore: "https://oldschool.runescape.wiki/images/thumb/3/34/Herblore_icon.png/21px-Herblore_icon.png",
    agility: "https://oldschool.runescape.wiki/images/thumb/0/0a/Agility_icon.png/21px-Agility_icon.png",
    thieving: "https://oldschool.runescape.wiki/images/thumb/4/4a/Thieving_icon.png/21px-Thieving_icon.png",
    slayer: "https://oldschool.runescape.wiki/images/thumb/2/28/Slayer_icon.png/21px-Slayer_icon.png",
    farming: "https://oldschool.runescape.wiki/images/thumb/f/fc/Farming_icon.png/21px-Farming_icon.png",
    runecraft: "https://oldschool.runescape.wiki/images/thumb/6/63/Runecraft_icon.png/21px-Runecraft_icon.png",
    hunter: "https://oldschool.runescape.wiki/images/thumb/d/dd/Hunter_icon.png/21px-Hunter_icon.png",
    construction: "https://oldschool.runescape.wiki/images/thumb/f/f6/Construction_icon.png/21px-Construction_icon.png"
  };
  function getSkillIcon(skillName) {
    return SKILL_ICONS[skillName] || "";
  }
  window.getSkillIcon = getSkillIcon;
  // Shared achievements catalog used by multiple pages
  // Keep this in one place to avoid drift between app.js and achievements.js
  const ACHIEVEMENT_CATALOG = [
    // Meta tier (prestige) - neutral, descriptive titles
    { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster: rank #1 or #1 in 3+ skills', desc: 'Rank #1 overall or #1 in 3+ skills.', category: 'tier', rarity: 'mythic' },
    { key: 'tier-master', icon: '🏆', label: 'Master: top 0.01% overall', desc: 'Be in the top 0.01% overall.', category: 'tier', rarity: 'legendary' },
    { key: 'tier-diamond', icon: '💎', label: 'Diamond: top 0.1% overall', desc: 'Be in the top 0.1% overall.', category: 'tier', rarity: 'epic' },

    // Competitive Rankings - clear labels
    { key: 'triple-crown', icon: '👑', label: 'Three #1 Skill Ranks', desc: 'Hold #1 rank in 3 or more skills at once.', category: 'rank', rarity: 'legendary' },
    { key: 'crowned-any', icon: '🥇', label: '#1 Rank (Any Skill)', desc: 'Achieve #1 rank in any single skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-10-any', icon: '🎯', label: 'Top 10 (Any Skill)', desc: 'Reach top 10 in any skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-100-any', icon: '⭐', label: 'Top 100 (Any Skill)', desc: 'Reach top 100 in any skill.', category: 'rank', rarity: 'common' },

    // Account Progression - straightforward
    { key: 'total-2000', icon: '📈', label: 'Total Level 2000+', desc: 'Reach total level 2000 or higher.', category: 'account', rarity: 'epic' },
    { key: 'total-1500', icon: '📊', label: 'Total Level 1500+', desc: 'Reach total level 1500 or higher.', category: 'account', rarity: 'rare' },
    { key: 'maxed-account', icon: '👑', label: 'All Skills 99', desc: 'Reach level 99 in every skill.', category: 'account', rarity: 'mythic' },
    { key: 'seven-99s', icon: '💫', label: 'Seven 99s', desc: 'Reach level 99 in seven or more skills.', category: 'account', rarity: 'rare' },
    { key: 'five-99s', icon: '✨', label: 'Five 99s', desc: 'Reach level 99 in five or more skills.', category: 'account', rarity: 'common' },
    { key: 'combat-maxed', icon: '⚔️', label: 'All Combat Skills 99', desc: 'Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer at 99.', category: 'account', rarity: 'epic' },

    // Skill Mastery - plain
    { key: 'skill-master-attack', icon: '🗡️', label: '99 Attack', desc: 'Reach level 99 in Attack.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-strength', icon: '💪', label: '99 Strength', desc: 'Reach level 99 in Strength.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-defence', icon: '🛡️', label: '99 Defence', desc: 'Reach level 99 in Defence.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-hitpoints', icon: '❤️', label: '99 Hitpoints', desc: 'Reach level 99 in Hitpoints.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-ranged', icon: '🏹', label: '99 Ranged', desc: 'Reach level 99 in Ranged.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-magic', icon: '🔮', label: '99 Magic', desc: 'Reach level 99 in Magic.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-prayer', icon: '🙏', label: '99 Prayer', desc: 'Reach level 99 in Prayer.', category: 'skill-mastery', rarity: 'rare' },

    // Gathering Skills - describe thresholds
    { key: 'gathering-elite', icon: '🪓', label: '90+ WC, Fishing, Mining', desc: 'Woodcutting, Fishing, and Mining at level 90+.', category: 'gathering', rarity: 'epic' },
    { key: 'woodcutting-expert', icon: '🌳', label: '85+ Woodcutting', desc: 'Reach level 85+ in Woodcutting.', category: 'gathering', rarity: 'common' },
    { key: 'fishing-expert', icon: '🎣', label: '85+ Fishing', desc: 'Reach level 85+ in Fishing.', category: 'gathering', rarity: 'common' },
    { key: 'mining-expert', icon: '⛏️', label: '85+ Mining', desc: 'Reach level 85+ in Mining.', category: 'gathering', rarity: 'common' },

    // Artisan Skills
    { key: 'artisan-elite', icon: '🔨', label: '90+ Smithing, Crafting, Fletching', desc: 'Smithing, Crafting, and Fletching at level 90+.', category: 'artisan', rarity: 'epic' },
    { key: 'cooking-expert', icon: '👨‍🍳', label: '85+ Cooking', desc: 'Reach level 85+ in Cooking.', category: 'artisan', rarity: 'common' },
    { key: 'firemaking-expert', icon: '🔥', label: '85+ Firemaking', desc: 'Reach level 85+ in Firemaking.', category: 'artisan', rarity: 'common' },
    { key: 'smithing-expert', icon: '⚒️', label: '85+ Smithing', desc: 'Reach level 85+ in Smithing.', category: 'artisan', rarity: 'common' },

    // Support Skills
    { key: 'support-elite', icon: '🧪', label: '90+ Herblore, Runecraft, Slayer', desc: 'Herblore, Runecraft, and Slayer at level 90+.', category: 'support', rarity: 'epic' },
    { key: 'herblore-expert', icon: '🌿', label: '85+ Herblore', desc: 'Reach level 85+ in Herblore.', category: 'support', rarity: 'common' },
    { key: 'agility-expert', icon: '🏃', label: '85+ Agility', desc: 'Reach level 85+ in Agility.', category: 'support', rarity: 'common' },
    { key: 'thieving-expert', icon: '🕵️', label: '85+ Thieving', desc: 'Reach level 85+ in Thieving.', category: 'support', rarity: 'common' },

    // Playstyle Specializations
    { key: 'balanced', icon: '⚖️', label: 'Balanced Levels', desc: 'All skills ≥40 with spread ≤30 levels.', category: 'playstyle', rarity: 'rare' },
    { key: 'glass-cannon', icon: '💥', label: 'High Offense, Low Defence', desc: 'Atk+Str ≥180 and Defence ≤60.', category: 'playstyle', rarity: 'epic' },
    { key: 'tank', icon: '🛡️', label: 'High Defence and Hitpoints', desc: 'Defence ≥90 and Hitpoints ≥85.', category: 'playstyle', rarity: 'rare' },
    { key: 'skiller', icon: '🎯', label: 'Non-Combat Focused', desc: 'Non-combat skills avg ≥70; combat skills avg ≤50.', category: 'playstyle', rarity: 'epic' },
    { key: 'combat-pure', icon: '⚔️', label: 'Combat Focused', desc: 'Combat skills avg ≥80; non-combat skills avg ≤30.', category: 'playstyle', rarity: 'rare' },

    // Performance Excellence
    { key: 'elite', icon: '🚀', label: 'Above Avg in 90%+ Skills', desc: 'Be above the population average in ≥90% of skills.', category: 'performance', rarity: 'legendary' },
    { key: 'versatile', icon: '🎭', label: 'Above Avg in 75%+ Skills', desc: 'Be above the population average in ≥75% of skills.', category: 'performance', rarity: 'epic' },
    { key: 'consistent', icon: '📊', label: 'Above Avg in 50%+ Skills', desc: 'Be above the population average in ≥50% of skills.', category: 'performance', rarity: 'rare' },
    { key: 'xp-millionaire', icon: '💰', label: '1,000,000+ Total XP', desc: 'Accumulate 1,000,000 or more total XP.', category: 'performance', rarity: 'epic' },
    { key: 'xp-billionaire', icon: '🏦', label: '1,000,000,000+ Total XP', desc: 'Accumulate 1,000,000,000 or more total XP.', category: 'performance', rarity: 'legendary' },

    // Activity & Dedication
    { key: 'daily-grinder', icon: '🕒', label: 'Updated in Last 24h', desc: 'Profile updated within the last 24 hours.', category: 'activity', rarity: 'common' },
    { key: 'weekly-active', icon: '📅', label: 'Updated in Last 7d', desc: 'Profile updated within the last 7 days.', category: 'activity', rarity: 'common' },
    { key: 'monthly-active', icon: '🗓️', label: 'Updated in Last 30d', desc: 'Profile updated within the last 30 days.', category: 'activity', rarity: 'common' },
    { key: 'dedicated', icon: '🔥', label: 'Updated in Last 3d', desc: 'Profile updated within the last 3 days.', category: 'activity', rarity: 'common' },

    // Milestone Achievements
    { key: 'level-50-average', icon: '🎯', label: 'Average Level 50+', desc: 'Average level of 50+ across all skills.', category: 'milestone', rarity: 'common' },
    { key: 'level-75-average', icon: '⭐', label: 'Average Level 75+', desc: 'Average level of 75+ across all skills.', category: 'milestone', rarity: 'rare' },
    { key: 'level-90-average', icon: '👑', label: 'Average Level 90+', desc: 'Average level of 90+ across all skills.', category: 'milestone', rarity: 'epic' },

    // Special Combinations
    { key: 'magic-ranged', icon: '🧙‍♂️', label: '80+ Magic and Ranged', desc: 'Both Magic and Ranged at level 80+.', category: 'special', rarity: 'rare' },
    { key: 'melee-specialist', icon: '⚔️', label: '85+ Atk, Str, Def', desc: 'Attack, Strength, and Defence all at 85+.', category: 'special', rarity: 'rare' },
    { key: 'support-master', icon: '🛠️', label: '80+ Prayer, Herblore, Runecraft', desc: 'Prayer, Herblore, and Runecraft all at 80+.', category: 'special', rarity: 'rare' },
    { key: 'gathering-master', icon: '📦', label: '80+ WC, Fishing, Mining', desc: 'Woodcutting, Fishing, and Mining all at 80+.', category: 'special', rarity: 'rare' }
  ];
  window.ACHIEVEMENT_CATALOG = ACHIEVEMENT_CATALOG;
  function populateSkillLinks(root) {
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.slice(1));
    const active = params.get("skill") || hashParams.get("skill");
    SKILLS.forEach((s) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `skill-hiscores.html?skill=${s}`;
      link.className = "flex-items-center gap-2 hover:text-accent";
      if (active === s) link.classList.add("text-accent", "font-semibold");
      const icon = getSkillIcon(s);
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = s;
        img.className = "skill-icon skill-icon--xs";
        link.appendChild(img);
      }
      const span = document.createElement("span");
      span.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      link.appendChild(span);
      li.appendChild(link);
      root.appendChild(li);
    });
  }
  window.populateSkillLinks = populateSkillLinks;
})();
