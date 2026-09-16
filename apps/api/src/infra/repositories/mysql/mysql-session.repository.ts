import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CreateSessionInput, Session, SessionRepository } from '../../../domain/sessions/session.repository.js';

interface SessionRow extends RowDataPacket {
  id: number;
  user_id: number;
  token_hash: string;
  csrf_token_hash: string;
  expires_at: Date;
  created_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
}

function mapSession(row: SessionRow): Session {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    lastSeenAt: new Date(row.last_seen_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export class MySqlSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO sessions
       (user_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [input.userId, input.tokenHash, input.csrfTokenHash, input.expiresAt, now, now],
    );
    return {
      id: result.insertId,
      ...input,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT * FROM sessions
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
       LIMIT 1`,
      [tokenHash, now],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async touch(id: number, at: Date): Promise<void> {
    await this.pool.execute('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [at, id]);
  }

  async revoke(id: number, at: Date): Promise<void> {
    await this.pool.execute(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [at, id],
    );
  }
}
