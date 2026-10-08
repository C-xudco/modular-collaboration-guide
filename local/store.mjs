import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { freshProfile, mutate, DomainError } from './runtime.mjs';

export function defaultDataDir() {
  if (process.env.COLLABORATION_DATA_DIR) return resolve(process.env.COLLABORATION_DATA_DIR);
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ModularCollaborationGuide')
    : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'modular-collaboration-guide');
}
export class LocalStore {
  constructor(file = join(defaultDataDir(), 'profile.sqlite')) {
    this.file = resolve(file);
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, revision INTEGER NOT NULL)');
  }
  snapshot() {
    const row = this.db.prepare('SELECT document, revision FROM profile WHERE id=1').get();
    return row ? { ...JSON.parse(row.document), revision: row.revision } : freshProfile();
  }
  async read(_userId) { return this.snapshot(); }
  async change(userId, revision, action) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new DomainError('INVALID', '档案版本无效。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.snapshot();
      if (old.revision !== revision) throw new DomainError('CONFLICT', '档案已更新，请刷新后重试。');
      const next = mutate(old, action);
      if (next !== old) this.db.prepare('INSERT INTO profile(id, document, revision) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision').run(JSON.stringify(next), next.revision);
      this.db.exec('COMMIT');
      return next;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
