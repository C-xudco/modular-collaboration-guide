import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("collaboration_profiles", {
  userId: text("user_id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
