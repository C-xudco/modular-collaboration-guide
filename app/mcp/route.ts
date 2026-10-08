import { getChatGPTUser } from "../chatgpt-auth";
import { getStore } from "../../lib/store";
import { handleMcp } from "../../lib/mcp";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handleMcp(request, async () => {
    const user = await getChatGPTUser();
    return user ? { store: getStore(), userId: user.userId } : null;
  });
}
