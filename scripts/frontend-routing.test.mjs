import test from "node:test";
import assert from "node:assert/strict";
import { route, routeTitle, routeNavigation } from "../frontend/lib/routes.js";
import { SKILLS } from "../frontend/lib/domain.js";

const parse = (path) => route(new URL(path, "https://hiscores.example/"));

test("hash routes retain filters and select the matching title and navigation", () => {
  for (const [hash, type, heading, navigation] of [
    ["overall", "overall", "Rankings", "overall"],
    ["achievements", "achievements", "Achievements", "achievements"],
    ["stories", "stories", "World stories", "stories"],
    ["progress", "progress", "Gains & records", "progress"],
    ["bosses", "activity", "Boss hiscores", "bosses"],
    ["wealth", "activity", "Bank value hiscores", "wealth"],
  ]) {
    const current = parse(`/#${hash}?page=2&q=Ada`);
    assert.equal(current.type, type);
    assert.equal(current.params.get("page"), "2");
    assert.equal(current.params.get("q"), "Ada");
    assert.equal(routeTitle(current), heading);
    assert.equal(routeNavigation(current), navigation);
  }
  for (const skill of SKILLS) {
    const current = parse(`/#skills/${skill}?minLevel=80`);
    assert.equal(current.type, "skill");
    assert.equal(current.skill, skill);
    assert.equal(current.params.get("minLevel"), "80");
    assert.equal(routeNavigation(current), "overall");
    assert.ok(routeTitle(current).endsWith(" hiscores"));
  }
});

test("legacy HTML entry points preserve defaults and allow hash overrides", () => {
  assert.equal(parse("/achievements.html").type, "achievements");
  assert.equal(parse("/skill-hiscores.html").skill, "attack");
  assert.equal(parse("/skill-hiscores.html?skill=sailing").skill, "sailing");
  assert.equal(parse("/skill-hiscores.html?skill=unknown").type, "invalid");
  assert.equal(parse("/achievements.html#wealth").path, "wealth");
  assert.equal(parse("/").type, "overall");
});

test("player names decode once and malformed or unknown routes stay invalid", () => {
  const current = parse("/#user/Red%20Fox");
  assert.deepEqual(current, { type: "player", username: "Red Fox" });
  assert.equal(routeTitle(current), "Red Fox");
  assert.equal(routeNavigation(current), "overall");
  assert.equal(parse("/#user/Percent%2520Name").username, "Percent%20Name");
  for (const hash of ["user/%E0%A4%A", "missing", "skills/not-a-skill"])
    assert.equal(parse(`/#${hash}`).type, "invalid");
});
