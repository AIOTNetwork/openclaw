import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import type { StoredToken } from "./types.js";

/** Raw row shape from SQLite (snake_case columns) */
type TokenRow = {
  channel_type: string;
  channel_user_id: string;
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
  created_at: number;
};

export class TokenService {
  private db: Database.Database;

  constructor(dbDir: string) {
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, "tokens.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        channel_type     TEXT NOT NULL,
        channel_user_id  TEXT NOT NULL,
        access_token     TEXT NOT NULL,
        refresh_token    TEXT NOT NULL,
        user_id          TEXT NOT NULL,
        expires_at       INTEGER NOT NULL,
        created_at       INTEGER NOT NULL,
        PRIMARY KEY (channel_type, channel_user_id)
      )
    `);
  }

  getToken(channelType: string, channelUserId: string): StoredToken | null {
    const row = this.db
      .prepare("SELECT * FROM tokens WHERE channel_type = ? AND channel_user_id = ?")
      .get(channelType, channelUserId) as TokenRow | undefined;

    if (!row) return null;

    // Auto-revoke if expired
    if (row.expires_at < Date.now()) {
      this.revokeToken(channelType, channelUserId);
      return null;
    }

    return {
      channelType: row.channel_type,
      channelUserId: row.channel_user_id,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      userId: row.user_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  storeToken(
    channelType: string,
    channelUserId: string,
    accessToken: string,
    refreshToken: string,
    userId: string,
    ttlMs: number,
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tokens
        (channel_type, channel_user_id, access_token, refresh_token, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(channelType, channelUserId, accessToken, refreshToken, userId, now + ttlMs, now);
  }

  revokeToken(channelType: string, channelUserId: string): void {
    this.db
      .prepare("DELETE FROM tokens WHERE channel_type = ? AND channel_user_id = ?")
      .run(channelType, channelUserId);
  }

  updateAccessToken(channelType: string, channelUserId: string, accessToken: string): void {
    this.db
      .prepare("UPDATE tokens SET access_token = ? WHERE channel_type = ? AND channel_user_id = ?")
      .run(accessToken, channelType, channelUserId);
  }

  cleanup(): number {
    const result = this.db.prepare("DELETE FROM tokens WHERE expires_at < ?").run(Date.now());
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
