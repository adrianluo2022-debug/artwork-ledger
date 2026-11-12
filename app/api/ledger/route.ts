import { context, json, safe } from "../../../lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  return safe(async () => {
    const { owner, db } = await context();
    const result = await db.batch([
      db.prepare("SELECT data FROM works WHERE owner_id = ? ORDER BY rowid DESC").bind(owner),
      db.prepare("SELECT data FROM deals WHERE owner_id = ? ORDER BY rowid DESC").bind(owner),
    ]);
    return json({ works: result[0].results.map((r: any) => JSON.parse(r.data)), deals: result[1].results.map((r: any) => JSON.parse(r.data)) });
  });
}
