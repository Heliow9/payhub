import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { NotificationService } from './notification.service.js';

export type OutboxDispatchResult = { sent: number; failed: number; terminal: number };
function errorText(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 1000); }

export class NotificationOutboxService {
  constructor(private pool: Pool, private notifications: NotificationService) {}

  async dispatch(owner: string, limit = 20): Promise<OutboxDispatchResult> {
    const result: OutboxDispatchResult = { sent: 0, failed: 0, terminal: 0 };
    const safe = Math.min(Math.max(limit, 1), 100);
    for (let index = 0; index < safe; index++) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT id,notification_id notificationId,attempt_count attempts
           FROM notification_outbox
          WHERE (status='PENDING' AND next_attempt_at<=UTC_TIMESTAMP())
             OR (status='CLAIMED' AND lease_until<UTC_TIMESTAMP())
          ORDER BY id
          LIMIT 1`,
      );
      const row = rows[0];
      if (!row) break;

      const [claim] = await this.pool.execute<ResultSetHeader>(
        `UPDATE notification_outbox
            SET status='CLAIMED',owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 120 SECOND),
                attempt_count=attempt_count+1,updated_at=UTC_TIMESTAMP()
          WHERE id=? AND (
            (status='PENDING' AND next_attempt_at<=UTC_TIMESTAMP())
            OR (status='CLAIMED' AND lease_until<UTC_TIMESTAMP())
          )`,
        [owner, row.id],
      );
      if (claim.affectedRows === 0) continue;

      const attempt = Number(row.attempts ?? 0) + 1;
      try {
        await this.notifications.deliverStored(Number(row.notificationId));
        await this.pool.execute(
          `UPDATE notification_outbox
              SET status='SENT',owner=NULL,lease_until=NULL,last_error=NULL,sent_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP()
            WHERE id=? AND owner=? AND status='CLAIMED'`,
          [row.id, owner],
        );
        result.sent++;
      } catch (error) {
        const terminal = attempt >= 5;
        if (terminal) {
          await this.pool.execute(
            `UPDATE notification_outbox
                SET status='FAILED',owner=NULL,lease_until=NULL,last_error=?,updated_at=UTC_TIMESTAMP()
              WHERE id=? AND owner=? AND status='CLAIMED'`,
            [errorText(error), row.id, owner],
          );
          result.terminal++;
        } else {
          const delays = [1, 5, 15, 60];
          const delay = delays[Math.min(attempt - 1, delays.length - 1)]!;
          await this.pool.execute(
            `UPDATE notification_outbox
                SET status='PENDING',owner=NULL,lease_until=NULL,
                    next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),last_error=?,updated_at=UTC_TIMESTAMP()
              WHERE id=? AND owner=? AND status='CLAIMED'`,
            [delay, errorText(error), row.id, owner],
          );
          result.failed++;
        }
      }
    }
    return result;
  }
}
