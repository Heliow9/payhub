import type { Pool } from 'mysql2/promise';
import type { AuditInput, AuditRepository } from '../../../domain/audit/audit.repository.js';

export class MySqlAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: AuditInput): Promise<void> {
    await this.pool.execute(
      `INSERT INTO audit_logs
       (actor_user_id, action, target_type, target_id, ip_address, user_agent, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.actorUserId ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        new Date(),
      ],
    );
  }
}
