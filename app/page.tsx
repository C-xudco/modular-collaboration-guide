import { requireChatGPTUser } from "./chatgpt-auth";
import { Panel } from "../ui/panel";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser("/");
  return <Panel />;
}
