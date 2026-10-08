import { getChatGPTUser } from "../../chatgpt-auth";
import { getStore } from "../../../lib/store";
import { DomainError } from "../../../lib/domain";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof DomainError) return Response.json({ error: e.message, code: e.code }, { status: e.code === "CONFLICT" ? 409 : 400 });
  console.error("profile operation failed", e instanceof Error ? e.message : "unknown");
  return Response.json({ error: "云端档案暂时不可用，请稍后重试。" }, { status: 503 });
}
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  try { return Response.json({ profile: await getStore().read(user.userId) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "请求来源不匹配。" }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 1100000) throw new DomainError("LIMIT", "请求过大。");
    const body = JSON.parse(text);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new DomainError("INVALID", "档案版本无效。");
    return Response.json({ profile: await getStore().change(user.userId, body.revision, body.action) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
