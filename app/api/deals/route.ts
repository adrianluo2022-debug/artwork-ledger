import { ApiError, body, checkWrite, context, json, recordId, safe } from "../../../lib/api";
import { validateDeal } from "../../../lib/validation.mjs";
export const dynamic = "force-dynamic";
async function save(request: Request, update: boolean) {
  return safe(async () => {
    checkWrite(request);
    const { owner, db } = await context(); const raw = await body(request);
    if (update && !raw.id) throw new ApiError("请选择需要修改的记录。");
    const deal = validateDeal(raw);
    const work = await db.prepare("SELECT id FROM works WHERE owner_id = ? AND id = ?").bind(owner, deal.workId).first();
    if (!work) throw new ApiError("请先添加或选择一张作品。");
    if (update) {
      const result = await db.prepare("UPDATE deals SET work_id = ?, data = ? WHERE owner_id = ? AND id = ?").bind(deal.workId, JSON.stringify(deal), owner, deal.id).run();
      if (!result.meta.changes) throw new ApiError("记录不存在，请刷新。", 404);
    } else {
      await db.prepare("INSERT INTO deals (owner_id, id, work_id, data) VALUES (?, ?, ?, ?)").bind(owner, deal.id, deal.workId, JSON.stringify(deal)).run();
    }
    return json(deal, update ? 200 : 201);
  });
}
export const POST = (r: Request) => save(r, false);
export const PUT = (r: Request) => save(r, true);
export async function DELETE(request: Request) {
  return safe(async () => {
    checkWrite(request); const { owner, db } = await context(); const id = recordId(request);
    const result = await db.prepare("DELETE FROM deals WHERE owner_id = ? AND id = ?").bind(owner, id).run();
    if (!result.meta.changes) throw new ApiError("记录已不存在。", 404);
    return json({ ok: true });
  });
}
