export const maxWebMcpOutputChars = 1_500;

export function capWebMcpOutput(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= maxWebMcpOutputChars) return value;
  let contentLength = maxWebMcpOutputChars - 80;
  let result = { truncated: true, content: text.slice(0, contentLength) };
  while (JSON.stringify(result).length > maxWebMcpOutputChars && contentLength > 0) {
    contentLength = Math.max(0, contentLength - 64);
    result = { truncated: true, content: text.slice(0, contentLength) };
  }
  return result;
}
