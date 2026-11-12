import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function context() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError("请先登录，再打开你的画簿。", 401);
  if (!env.DB) throw new ApiError("记录库暂时不可用，请稍后重试。", 503);
  return { owner: user.userId, db: env.DB };
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError("请使用正确的记录格式。");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError("请求来源不匹配。", 403);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("记录内容不能为空。");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new ApiError("文件超过 20MB，请分批整理。"); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError("文件内容无法识别，请选择画簿导出的 JSON 备份。"); }
}
export function checkWrite(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError("请求来源不匹配。", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new ApiError("请从画簿页面操作。", 403);
}
export function recordId(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new ApiError("请选择一条有效记录。");
  return id;
}
export async function safe(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("D1_") || /SQLITE|constraint|database|syntax error/i.test(message)) {
      console.error("Ledger database operation failed", message);
      return json({ error: "保存失败，记录可能已发生变化。请刷新后重试。" }, 409);
    }
    return json({ error: message || "操作未完成，请稍后重试。" }, 400);
  }
}
