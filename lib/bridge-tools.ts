export type BridgeTool = { name: string; _meta?: Record<string, unknown> };
// Discover only the tools that the host permits this App to call.
export function companionToolName(tools: BridgeTool[], action: "profile" | "update"): string {
  const suffix = "collaboration_" + action;
  const candidates = tools.filter(tool => {
    const metadata = tool._meta?._codex_apps as { resource_uri?: string } | undefined;
    return tool.name.endsWith(suffix) || metadata?.resource_uri?.split("/").at(-1)?.endsWith(suffix);
  });
  if (candidates.length !== 1) throw new Error("当前连接未提供唯一的档案管理工具，请重新连接插件后打开面板。");
  return candidates[0].name;
}
