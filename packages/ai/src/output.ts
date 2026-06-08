const defaultMaxErrorOutputLength = 300;

export function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const firstBrace = trimmed.search(/[[{]/);
  if (firstBrace === -1) {
    return null;
  }

  const open = trimmed[firstBrace];
  const close = open === "{" ? "}" : "]";
  const lastBrace = trimmed.lastIndexOf(close);
  if (lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function parseAIJson<T = unknown>(text: string): T | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

export function formatAIErrorOutput(output: string, maxLength = defaultMaxErrorOutputLength): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trim()}...`;
}
