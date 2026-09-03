const htmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

export function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalized = value;
  for (const [entity, replacement] of Object.entries(htmlEntities)) {
    normalized = normalized.replaceAll(entity, replacement);
  }
  normalized = normalized.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export function uniqueText(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

/** Overlapping two-character windows for every CJK run, so `\u975e\u5c0f\u7d30\u80de\u80ba\u764c` shares `\u80ba\u764c` with `\u80ba\u764c\u81e8\u5e8a\u8a66\u9a57`. */
export function cjkBigrams(value: string): string[] {
  const bigrams = (value.match(/[\u3400-\u9fff]+/gu) ?? []).flatMap((run) => {
    const characters = [...run];
    if (characters.length < 2) return [];
    return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
  });
  return [...new Set(bigrams)];
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
