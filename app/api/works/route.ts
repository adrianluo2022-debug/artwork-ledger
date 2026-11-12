import { ApiError, body, checkWrite, context, json, recordId, safe } from "../../../lib/api";
import { validateWork } from "../../../lib/validation.mjs";
export const dynamic = "force-dynamic";
async function save(request: Request, update: boolean) {
  return safe(async () => {
    checkWrite(request);
    const { owner, db } = await context();
    const raw = await body(request);
    if (update && !raw.id) throw new ApiError("请选择需要修改的作品。");
    const work = validateWork(raw);
    if (update) {
      const result = await db.prepare("UPDATE works SET data = ? WHERE owner_id = ? AND id = ?").bind(JSON.stringify(work), owner, work.id).run();
      if (!result.meta.changes) throw new ApiError("作品不存在，请刷新。", 404);
    } else {
      await db.prepare("INSERT INTO works (owner_id, id, data) VALUES (?, ?, ?)").bind(owner, work.id, JSON.stringify(work)).run();
    }
    return json(work, update ? 200 : 201);
  });
}
export const POST = (r: Request) => save(r, false);
export const PUT = (r: Request) => save(r, true);
export async function DELETE(request: Request) {
  return safe(async () => {
    checkWrite(request);
    const { owner, db } = await context(); const id = recordId(request);
    const existing = await db.prepare("SELECT id FROM deals WHERE owner_id = ? AND work_id = ? LIMIT 1").bind(owner, id).first();
    if (existing) throw new ApiError("这张作品还有约稿或授权记录，请先逐条整理相关记录。", 409);
    const result = await db.prepare("DELETE FROM works WHERE owner_id = ? AND id = ?").bind(owner, id).run();
    if (!result.meta.changes) throw new ApiError("作品已不存在。", 404);
    return json({ ok: true });
  });
}
