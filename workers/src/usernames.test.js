import test from "node:test";
import assert from "node:assert/strict";
import { fetchInventedWord, generateUsername, generateUsernames } from "./usernames.js";

function seededRandom(seed = 12345) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const sequence = (...values) => () => values.shift() ?? 0.9;

test("source words get optional casing, spaces and digits without truncation", () => {
  assert.equal(generateUsername(new Set(), { word: "brindle", rng: sequence(0.8, 0.9, 0.9) }), "brindle");
  assert.equal(generateUsername(new Set(), { word: "brindle", rng: sequence(0.1, 0.9, 0.9) }), "Brindle");
  assert.equal(generateUsername(new Set(), { word: "brindle", rng: sequence(0.37, 0.9, 0.9) }), "BRINDLE");
  assert.equal(generateUsername(new Set(), { word: "brindle", rng: sequence(0.8, 0.1, 0, 0.9) }), "brindle fox");
  assert.equal(generateUsername(new Set(), { word: "brindle", rng: sequence(0.8, 0.9, 0.1, 0, 0.1) }), "brindle 1");
  assert.equal(generateUsername(new Set(), { word: "abcdefghijkl", rng: sequence(0.8, 0.1, 0, 0.1, 0.5, 0.1) }), "abcdefghijkl");
});

test("large fallback population stays unique, valid and varied", async () => {
  const names = await generateUsernames(10000, new Set(), { ALLOW_TWODNE_SCRAPE: "false" }, { rng: seededRandom() });
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length);
  for (const name of names) {
    assert.match(name, /^[a-z][a-z0-9 ]{2,11}$/i);
    assert.equal(name, name.trim());
    assert.ok(!name.includes("  "));
  }
  const fraction = (pattern) => names.filter((name) => pattern.test(name)).length / names.length;
  assert.ok(fraction(/\d/) > 0.15 && fraction(/\d/) < 0.35);
  assert.ok(fraction(/ /) > 0.05);
  assert.ok(fraction(/^[a-z]+$/) > 0.2);
});

test("collisions are checked without regard to case and unsuitable words fall back", () => {
  const name = generateUsername(new Set(["brindle"]), { word: "BRINDLE", rng: seededRandom() });
  assert.notEqual(name.toLowerCase(), "brindle");
  for (const word of ["", "<script>", "far-too-long-to-use", "a" ])
    assert.match(generateUsername(new Set(), { word, rng: seededRandom() }), /^[a-z][a-z0-9 ]{2,11}$/i);
});

test("scraper accepts the word element and rejects errors and unrelated headings", async () => {
  assert.equal(await fetchInventedWord(async () => new Response('<div id="definition-word" class="word">platygian</div>')), "platygian");
  for (const html of ['<h1>Unavailable</h1>', '<div id="definition-word">abcdefghijklmnop</div>', '<div id="definition-word">two words</div>'])
    assert.equal(await fetchInventedWord(async () => new Response(html)), null);
  assert.equal(await fetchInventedWord(async () => new Response("error", { status: 503 })), null);
  assert.equal(await fetchInventedWord(async () => { throw new Error("offline"); }), null);
});

test("batch previews bound requests, use fetched words, and survive source outages", async () => {
  let calls = 0;
  const names = await generateUsernames(50, new Set(), {}, {
    rng: seededRandom(),
    fetchImpl: async (_url, options) => {
      calls++;
      assert.ok(options.signal instanceof AbortSignal);
      return new Response('<div id="definition-word">platygian</div>');
    },
  });
  assert.equal(calls, 5);
  assert.ok(names[0].toLowerCase().startsWith("platygian"));
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, 50);
  assert.equal((await generateUsernames(5, new Set(), {}, {
    fetchImpl: async () => { throw new Error("offline"); },
  })).length, 5);
});
