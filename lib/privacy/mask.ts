export type IdentifierKind = "email" | "phone" | "taiwan_id" | "record_number" | "name" | "birth_date" | "address";

export interface MaskFinding {
  kind: IdentifierKind;
  placeholder: string;
  start: number;
  end: number;
}

export interface MaskResult {
  maskedText: string;
  findings: MaskFinding[];
}

interface PatternDefinition {
  kind: IdentifierKind;
  expression: RegExp;
}

function patterns(): PatternDefinition[] {
  return [
    { kind: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
    { kind: "taiwan_id", expression: /\b[A-Z][12]\d{8}\b/giu },
    { kind: "phone", expression: /(?<!\d)(?:\+?886[-\s]?)?(?:0?9\d{2}|0\d{1,2})[-\s]?\d{3,4}[-\s]?\d{3,4}(?!\d)/gu },
    { kind: "record_number", expression: /(?:病歷號碼?|病歷編號|medical\s*record(?:\s*number)?|mrn)\s*[:：#]?\s*[A-Z0-9-]{4,}/giu },
    { kind: "birth_date", expression: /(?:出生日期|生日|date\s*of\s*birth|dob)\s*[:：]?\s*(?:19|20)\d{2}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2}日?/giu },
    { kind: "name", expression: /(?:病人姓名|患者姓名|姓名|patient\s*name)\s*[:：]?\s*[\p{Script=Han}A-Z][\p{Script=Han}A-Z .'-]{1,40}/giu },
    { kind: "address", expression: /(?:地址|住址|address)\s*[:：]?\s*[^\n,，;；]{6,80}/giu },
  ];
}

interface LocatedIdentifier {
  kind: IdentifierKind;
  start: number;
  end: number;
}

export function locateDirectIdentifiers(text: string): LocatedIdentifier[] {
  const candidates = patterns().flatMap(({ kind, expression }) =>
    [...text.matchAll(expression)].map((match) => ({
      kind,
      start: match.index,
      end: match.index + match[0].length,
    })),
  ).sort((left, right) => left.start - right.start || right.end - left.end);

  const accepted: LocatedIdentifier[] = [];
  for (const candidate of candidates) {
    if (accepted.some((current) => candidate.start < current.end && candidate.end > current.start)) continue;
    accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start);
}

export function maskDirectIdentifiers(text: string): MaskResult {
  const located = locateDirectIdentifiers(text);
  const counters = new Map<IdentifierKind, number>();
  const findings: MaskFinding[] = located.map((finding) => {
    const count = (counters.get(finding.kind) ?? 0) + 1;
    counters.set(finding.kind, count);
    return { ...finding, placeholder: `[MASKED_${finding.kind.toUpperCase()}_${count}]` };
  });

  let cursor = 0;
  const chunks: string[] = [];
  for (const finding of findings) {
    chunks.push(text.slice(cursor, finding.start), finding.placeholder);
    cursor = finding.end;
  }
  chunks.push(text.slice(cursor));
  return { maskedText: chunks.join(""), findings };
}

export function hasDirectIdentifiers(text: string): boolean {
  const withoutPlaceholders = text.replace(/\[MASKED_[A-Z_]+_\d+\]/g, "");
  return locateDirectIdentifiers(withoutPlaceholders).length > 0;
}
