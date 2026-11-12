import { sqliteTable, text, primaryKey, foreignKey } from "drizzle-orm/sqlite-core";

export const works = sqliteTable("works", {
  ownerId: text("owner_id").notNull(),
  id: text("id").notNull(),
  data: text("data").notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.id] })]);

export const deals = sqliteTable("deals", {
  ownerId: text("owner_id").notNull(),
  id: text("id").notNull(),
  workId: text("work_id").notNull(),
  data: text("data").notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.id] }),
  foreignKey({ columns: [t.ownerId, t.workId], foreignColumns: [works.ownerId, works.id] }).onDelete("restrict"),
]);
