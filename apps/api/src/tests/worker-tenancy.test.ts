import webpush from 'web-push';
import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../services/notification.service.js';
import { normalizeCompanyJobs, scheduleCompanyDue, workerCycle } from '../worker/main.js';

describe('worker e notificações multiempresa', () => {
  it('limita o tempo de espera de cada envio Web Push', async () => {
    const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);
    const pool = {
      execute: async (sql: string) => {
        if (sql.includes('FROM push_subscriptions')) return [[{
          id: 7,
          endpoint: 'https://push.example.test/subscription',
          p256dh: 'key',
          authSecret: 'secret',
        }]];
        return [{ affectedRows: 1 }];
      },
    };
    const service = new NotificationService(pool as never, {
      VAPID_SUBJECT: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
    } as never);

    await (service as any).sendPush(
      { companyId: 1, type: 'USER', id: 10, role: 'MASTER' },
      { category: 'SYSTEM', title: 'Teste', body: 'Teste', notificationId: 99 },
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[2]).toMatchObject({ timeout: 10_000 });
    send.mockRestore();
  });

  it('processa a fila principal antes dos alertas operacionais', async () => {
    const order: string[] = [];
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("job_type='PAYROLL_IMPORT'")) {
          order.push('normalizacao');
          return [[]];
        }
        return [[]];
      },
      execute: async (sql: string) => {
        if (sql.includes('FROM group_schedules')) order.push('agendamentos');
        return [[]];
      },
    };
    const services = {
      connector: {
        markOfflineStale: async () => {
          order.push('alertas');
          return [];
        },
      },
      notifications: { notifyAdmins: async () => undefined },
      payrolls: { normalizeCompletedJob: async () => ({ created: 0, unchanged: 0, skipped: 0 }) },
      runs: { startGroup: async () => ({ runId: 1, jobId: 1 }) },
    };

    await workerCycle(pool as never, services as never, {
      CONNECTOR_OFFLINE_SECONDS: 60,
    } as never, new Date('2026-09-21T12:00:00Z'));

    expect(order).toEqual(['normalizacao', 'agendamentos', 'alertas']);
  });

  it('notifica somente administradores ativos da empresa do alerta', async () => {
    const recipients: Array<{ companyId: number; id: number }> = [];
    const pool = {
      execute: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM users')) {
          expect(sql).toContain('company_id=?');
          expect(params[0]).toBe(2);
          return [[{ id: 20, role: 'MASTER' }, { id: 21, role: 'ANALISTA' }]];
        }
        return [[]];
      },
    };
    const service = new NotificationService(pool as never, {
      VAPID_SUBJECT: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
    } as never);
    (service as any).notifyRecipient = async (recipient: { companyId: number; id: number }) => {
      recipients.push({ companyId: recipient.companyId, id: recipient.id });
      return 1;
    };

    await service.notifyAdmins(2, { category: 'SYSTEM', title: 'Teste', body: 'Teste' });
    expect(recipients).toEqual([{ companyId: 2, id: 20 }, { companyId: 2, id: 21 }]);
  });

  it('agenda preserva company_id do grupo até a execução e o job', async () => {
    const calls: any[] = [];
    let executeCount = 0;
    const pool = {
      execute: async (sql: string, params: unknown[] = []) => {
        executeCount += 1;
        if (sql.includes('FROM group_schedules')) {
          expect(sql).toContain('g.company_id companyId');
          return [[{ scheduleId: 4, groupId: 8, companyId: 2 }]];
        }
        if (sql.includes('INSERT IGNORE INTO schedule_executions')) {
          expect(sql).toContain('(company_id,schedule_id');
          expect(params[0]).toBe(2);
          return [{ affectedRows: 1, insertId: 90 }];
        }
        if (sql.includes('UPDATE schedule_executions')) {
          expect(params).toEqual([55, 90, 2]);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`SQL não previsto #${executeCount}: ${sql}`);
      },
    };
    const services = {
      runs: {
        startGroup: async (context: any, groupId: number) => {
          calls.push({ context, groupId });
          return { runId: 55, jobId: 77 };
        },
      },
    };

    const result = await scheduleCompanyDue(pool as never, services as never, new Date('2026-09-18T12:00:00Z'));
    expect(calls[0]).toMatchObject({ context: { companyId: 2 }, groupId: 8 });
    expect(result).toContainEqual({ companyId: 2, groupId: 8, scheduleId: 4, runId: 55, jobId: 77 });
  });

  it('falha de uma agenda não interrompe outra empresa', async () => {
    const started: number[] = [];
    const pool = {
      execute: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM group_schedules')) return [[
          { scheduleId: 10, groupId: 100, companyId: 1 },
          { scheduleId: 20, groupId: 200, companyId: 2 },
        ]];
        if (sql.includes('INSERT IGNORE INTO schedule_executions')) {
          if (params[1] === 10) throw new Error('falha isolada');
          return [{ affectedRows: 1, insertId: 222 }];
        }
        if (sql.includes('UPDATE schedule_executions')) return [{ affectedRows: 1 }];
        throw new Error(`SQL não previsto: ${sql}`);
      },
    };
    const services = { runs: { startGroup: async (context: any) => { started.push(context.companyId); return { runId: 2, jobId: 3 }; } } };
    const result = await scheduleCompanyDue(pool as never, services as never, new Date('2026-09-18T12:00:00Z'));
    expect(started).toEqual([2]);
    expect(result).toContainEqual({ companyId: 1, groupId: 100, scheduleId: 10, failed: true });
    expect(result).toContainEqual({ companyId: 2, groupId: 200, scheduleId: 20, runId: 2, jobId: 3 });
  });

  it('falha da empresa A não impede processar job da empresa B', async () => {
    const notified: number[] = [];
    const pool = {
      query: async () => [[
        { id: 101, companyId: 1 },
        { id: 202, companyId: 2 },
      ]],
    };
    const services = {
      payrolls: {
        normalizeCompletedJob: async (id: number) => {
          if (id === 101) throw new Error('falha controlada');
          return { created: 1, unchanged: 0, skipped: 0 };
        },
      },
      notifications: {
        notifyAdmins: async (companyId: number) => { notified.push(companyId); },
      },
    };

    const result = await normalizeCompanyJobs(pool as never, services as never);
    expect(result).toEqual({ completed: [202], failed: [101] });
    expect(notified).toEqual([1]);
  });
});
