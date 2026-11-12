import { body, checkWrite, context, json, safe } from "../../../lib/api";
import { validateBackup } from "../../../lib/validation.mjs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return safe(async () => {
    checkWrite(request); const { owner, db } = await context();
    const backup = validateBackup(await body(request));
    const statements = [
      ...backup.works.map((w: any) => db.prepare("INSERT INTO works (owner_id, id, data) VALUES (?, ?, ?) ON CONFLICT(owner_id, id) DO UPDATE SET data = excluded.data").bind(owner, w.id, JSON.stringify(w))),
      ...backup.deals.map((d: any) => db.prepare("INSERT INTO deals (owner_id, id, work_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, id) DO UPDATE SET work_id = excluded.work_id, data = excluded.data").bind(owner, d.id, d.workId, JSON.stringify(d))),
    ];
    if (statements.length) await db.batch(statements);
    return json({ ok: true, works: backup.works.length, deals: backup.deals.length });
  });
}
