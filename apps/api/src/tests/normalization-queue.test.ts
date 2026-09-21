import { describe, expect, it } from 'vitest';
import { NormalizationQueueService, type NormalizationClaim } from '../services/normalization-queue.service.js';

function claim(attempt = 1): NormalizationClaim {
  return { jobId: 12, companyId: 2, payrollRunId: 50, owner: 'worker-a', attempt };
}

describe('NormalizationQueueService', () => {
  it('faz claim condicional com lease expirado e escopo de empresa', async () => {
    let claimed = false;
    const seen: string[] = [];
    const pool = {
      query: async (sql: string) => { seen.push(sql); return [[{ id: 12, companyId: 2, payrollRunId: 50, attempts: 0 }]]; },
      execute: async (sql: string, params: unknown[]) => {
        seen.push(sql);
        expect(params).toEqual(['worker-a', 900, 12, 2]);
        if (claimed) return [{ affectedRows: 0 }];
        claimed = true;
        return [{ affectedRows: 1 }];
      },
    };
    const queue = new NormalizationQueueService(pool as never);
    expect(await queue.claimNext('worker-a', 900)).toEqual(claim());
    expect(seen.join('\n')).toMatch(/normalization_lease_until<UTC_TIMESTAMP\(\)/i);
    expect(seen.join('\n')).toMatch(/company_id=\?/i);
  });

  it('renova lease exigindo job, empresa e owner', async () => {
    let params: unknown[] = [];
    const pool = { execute: async (_sql: string, p: unknown[]) => { params = p; return [{ affectedRows: 1 }]; } };
    const queue = new NormalizationQueueService(pool as never);
    await queue.renew(12, 2, 'worker-a', 900);
    expect(params).toEqual([900, 12, 2, 'worker-a']);
  });

  it('rejeita renovação quando o lease já foi perdido', async () => {
    const queue = new NormalizationQueueService({ execute: async () => [{ affectedRows: 0 }] } as never);
    await expect(queue.renew(12, 2, 'worker-a', 900)).rejects.toThrow('Lease de normalização perdido');
  });

  it('torna a terceira falha terminal e finaliza o run', async () => {
    const sql: string[] = [];
    const conn = {
      beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
      execute: async (statement: string) => {
        sql.push(statement);
        if (statement.includes('UPDATE import_jobs')) return [{ affectedRows: 1 }];
        if (statement.includes('SELECT COUNT(*) value')) return [[{ value: 0 }]];
        return [{ affectedRows: 1 }];
      },
    };
    const queue = new NormalizationQueueService({ getConnection: async () => conn } as never);
    expect(await queue.fail(claim(3), new Error('quebra'), 3)).toBe('FAILED');
    expect(sql.join('\n')).toContain('normalization_state=?');
    expect(sql.join('\n')).toContain('UPDATE payroll_runs');
  });
});
