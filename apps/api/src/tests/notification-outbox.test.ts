import { describe, expect, it, vi } from 'vitest';
import { NotificationOutboxService } from '../services/notification-outbox.service.js';
import { NotificationService } from '../services/notification.service.js';

describe('notification outbox', () => {
  it('grava notificação e outbox na mesma transação sem chamar rede', async () => {
    const statements: string[] = [];
    const conn = {
      beginTransaction: async () => undefined, rollback: async () => undefined, commit: async () => undefined, release: () => undefined,
      execute: async (sql: string) => { statements.push(sql); if (sql.includes('INSERT IGNORE INTO notifications')) return [{ affectedRows: 1, insertId: 90 }]; return [{ affectedRows: 1 }]; },
    };
    const service = new NotificationService({ getConnection: async () => conn } as never, { VAPID_SUBJECT: 'mailto:ops@example.test', VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' } as never);
    const spy = vi.spyOn(service as any, 'sendPush');
    expect(await service.notifyEmployee(1, 8, { category: 'SYSTEM', title: 'Teste', body: 'Teste' })).toBe(90);
    expect(statements.join('\n')).toContain('INSERT IGNORE INTO notifications');
    expect(statements.join('\n')).toContain('INSERT INTO notification_outbox');
    expect(spy).not.toHaveBeenCalled();
  });

  it('não cria outbox quando a notificação foi deduplicada', async () => {
    let outbox = 0;
    const conn = {
      beginTransaction: async () => undefined, rollback: async () => undefined, commit: async () => undefined, release: () => undefined,
      execute: async (sql: string) => { if (sql.includes('INSERT IGNORE INTO notifications')) return [{ affectedRows: 0, insertId: 0 }]; if (sql.includes('notification_outbox')) outbox++; return [{ affectedRows: 1 }]; },
    };
    const service = new NotificationService({ getConnection: async () => conn } as never, { VAPID_SUBJECT: 'mailto:ops@example.test', VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' } as never);
    expect(await service.notifyEmployee(1, 8, { category: 'SYSTEM', title: 'Teste', body: 'Teste', dedupKey: 'same' })).toBeNull();
    expect(outbox).toBe(0);
  });

  it('falha temporária volta para PENDING sem interromper o ciclo', async () => {
    const updates: Array<{ sql: string; params: unknown[] }> = [];
    let selects = 0;
    const pool = {
      query: async () => (++selects === 1 ? [[{ id: 5, notificationId: 90, attempts: 0 }]] : [[]]),
      execute: async (sql: string, params: unknown[]) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; },
    };
    const outbox = new NotificationOutboxService(pool as never, { deliverStored: async () => { throw new Error('rede indisponível'); } } as never);
    expect(await outbox.dispatch('worker-a', 20)).toEqual({ sent: 0, failed: 1, terminal: 0 });
    expect(updates.find((entry) => entry.sql.includes("SET status='PENDING'"))?.params[0]).toBe(1);
  });
});
