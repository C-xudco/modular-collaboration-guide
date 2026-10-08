import { env } from "cloudflare:workers";
import { freshProfile, mutate, DomainError, type Profile } from "./domain";

export interface DocumentStore {
  read(userId: string): Promise<Profile>;
  change(userId: string, revision: number, action: unknown): Promise<Profile>;
}
export class ProfileStore implements DocumentStore {
  constructor(private db: D1Database) {}
  async read(userId: string): Promise<Profile> {
    const row = await this.db.prepare("SELECT document, revision FROM collaboration_profiles WHERE user_id = ?").bind(userId).first<{ document: string; revision: number }>();
    if (!row) return freshProfile();
    return { ...JSON.parse(row.document), revision: row.revision };
  }
  async change(userId: string, revision: number, action: unknown): Promise<Profile> {
    const old = await this.read(userId);
    if (old.revision !== revision) throw new DomainError("CONFLICT", "档案已更新，请刷新后重试。");
    const next = mutate(old, action);
    if (next === old) return old;
    const document = JSON.stringify(next), at = new Date().toISOString();
    const result = old.revision === 0
      ? await this.db.prepare("INSERT INTO collaboration_profiles(user_id, document, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, document, next.revision, at).run()
      : await this.db.prepare("UPDATE collaboration_profiles SET document = ?, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(document, next.revision, at, userId, revision).run();
    if (result.meta.changes !== 1) throw new DomainError("CONFLICT", "另一个窗口刚修改了档案，请刷新。");
    return next;
  }
}
export function getStore() { if (!env.DB) throw new Error("D1 binding unavailable"); return new ProfileStore(env.DB); }
