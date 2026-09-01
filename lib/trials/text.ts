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

export function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
