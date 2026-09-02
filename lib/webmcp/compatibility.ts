export async function executeSafeMethodToolCompat(
  modelContext: Pick<WebMCP.ModelContext, "executeTool">,
  tool: WebMCP.RegisteredTool,
  signal?: AbortSignal,
): Promise<unknown> {
  if (tool.name !== "trialbridge_method" || tool.annotations?.readOnlyHint !== true) {
    throw new Error("Compatibility execution is restricted to the read-only public method tool.");
  }
  try {
    return await modelContext.executeTool(tool, {}, { signal });
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    if (!(error instanceof TypeError)) throw error;
    return modelContext.executeTool(tool, JSON.stringify({}), { signal });
  }
}
