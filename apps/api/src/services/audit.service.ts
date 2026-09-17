import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { RequestMeta } from '../core/types.js';

export class AuditService {
  constructor(private pool: Pool) {}

  async record(input: {
    actorUserId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: string | number | null;
    meta?: RequestMeta;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, ip_address, user_agent, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [input.actorUserId ?? null, input.action, input.targetType ?? null, input.targetId == null ? null : String(input.targetId),
        input.meta?.ipAddress ?? null, input.meta?.userAgent ?? null, input.metadata ? JSON.stringify(input.metadata) : null]
    );
  }

  async list(limit = 250): Promise<Record<string, unknown>[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId,
              a.ip_address AS ipAddress, a.user_agent AS userAgent, a.metadata_json AS metadataJson,
              a.created_at AS createdAt, u.id AS actorUserId, u.name AS actorName, u.email AS actorEmail
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.id DESC LIMIT ${safeLimit}`
    );
    return rows.map((row) => ({ ...row, metadata: row.metadataJson ? JSON.parse(row.metadataJson as string) : null, metadataJson: undefined }));
  }
}
