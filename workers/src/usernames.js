const pick = (items, rng) => items[Math.floor(rng() * items.length)];
const starts = "b br bl c cr cl d dr f fr fl g gr gl h j k l m n p pr pl r s sh sk sl st str t th tr v w wh z".split(" ");
const vowels = "a e i o u ai ea ee oo ou".split(" ");
const endings = "b d f g k l m n p r s t ch sh th ck nd ng nk nt rd rn sk st".split(" ");
const tails = "a en er el in ing ish le ly on y".split(" ");

function localWord(rng) {
  const stem = pick(starts, rng) + pick(vowels, rng) + pick(endings, rng);
  return rng() < 0.7 ? stem + pick(tails, rng) : stem;
}

// Keep full words; optional decoration is skipped when it would exceed 12.
export function generateUsername(existing = new Set(), { word, rng = Math.random } = {}) {
  const validWord = typeof word === "string" && /^[a-z]{3,12}$/i.test(word);
  for (let attempt = 0; attempt < 200; attempt++) {
    let name = validWord && attempt < 12 ? word.toLowerCase() : localWord(rng);
    const casing = rng();
    if (casing < 0.35) name = name[0].toUpperCase() + name.slice(1);
    else if (casing < 0.40) name = name.toUpperCase();
    else if (casing < 0.48) {
      const index = Math.floor(rng() * name.length);
      name = name.slice(0, index) + name[index].toUpperCase() + name.slice(index + 1);
    }
    // An occasional second short word produces names such as "Brindle mist".
    if (rng() < 0.18) {
      const second = pick(["fox", "cat", "bee", "sky", "tea", "moss", "mist", "oak"], rng);
      if (name.length + second.length + 1 <= 12) name += " " + second;
    }
    if (rng() < 0.25) {
      const digits = String(1 + Math.floor(rng() * 999));
      const separator = rng() < 0.2 ? " " : "";
      if (name.length + separator.length + digits.length <= 12) name += separator + digits;
    }
    if (!existing.has(name.toLowerCase())) return name;
  }
  throw new Error("Could not generate a unique player name");
}

export async function fetchInventedWord(fetchImpl = fetch) {
  try {
    const response = await fetchImpl("https://www.thisworddoesnotexist.com/", {
      signal: AbortSignal.timeout(1500),
      headers: { Accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    // Match the actual word element, never a page title or navigation text.
    const word = html.match(/<[^>]+\bid\s*=\s*["']definition-word["'][^>]*>\s*([a-z]{3,12})\s*<\//i)?.[1];
    return word?.toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function generateUsernames(count, existing = new Set(), env = {}, options = {}) {
  // Bound external requests and latency even for a 50-name preview. Additional
  // names and unavailable/unsuitable source words use the local word generator.
  const words = env.ALLOW_TWODNE_SCRAPE === "false" ? [] : await Promise.all(
    Array.from({ length: Math.min(count, 5) }, () => fetchInventedWord(options.fetchImpl)),
  );
  const names = [];
  for (let i = 0; i < count; i++) {
    const name = generateUsername(existing, { word: words[i], rng: options.rng });
    existing.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}
