export function hasDeclaredRequestBody(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  return (contentLength !== null && contentLength !== "0")
    || request.headers.has("transfer-encoding")
    || request.headers.has("content-type");
}
