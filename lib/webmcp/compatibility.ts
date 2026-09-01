export async function executeSafeMethodToolCompat(
  modelContext: Pick<WebMCP.ModelContext, "executeTool">,
  tool: WebMCP.RegisteredTool,
): Promise<unknown> {
  if (tool.name !== "trialbridge_method" || tool.annotations?.readOnlyHint !== true) {
    throw new Error("Compatibility execution is restricted to the read-only public method tool.");
  }
  try {
    return await modelContext.executeTool(tool, {});
  } catch {
    return modelContext.executeTool(tool, JSON.stringify({}));
  }
}
