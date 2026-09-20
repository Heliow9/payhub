import { describe, expect, it } from 'vitest';
import { ConnectorService } from '../services/connector.service.js';

class ConnectorPool {
  companyFilter: unknown = null;
  async query(sql: string, params: unknown[] = []): Promise<any> {
    if (sql.includes("status='QUEUED'")) { this.companyFilter = params[0]; return [[{ id: 22, payrollRunId: null }]]; }
    if (sql.includes('FROM import_jobs')) {
      this.companyFilter = params[0];
      return [[{ id: 22, companyId: 1, scopeJson: '{}' }]];
    }
    return [[]];
  }
  async execute(sql: string, params: unknown[] = []): Promise<any> {
    if (sql.includes('SELECT id FROM import_jobs')) return [[]];
    if (sql.includes('FROM import_jobs') && sql.includes('WHERE id=')) return [[{ id: 22, companyId: 1, scopeJson: '{}' }]];
    return [{ affectedRows: 1 }];
  }
  async getConnection(): Promise<any> {
    return { beginTransaction: async()=>undefined, commit:async()=>undefined, rollback:async()=>undefined, release:()=>undefined,
      query: this.query.bind(this), execute: this.execute.bind(this) };
  }
}

describe('isolamento da fila de conectores', () => {
  it('claim usa a empresa autenticada do conector', async () => {
    const pool = new ConnectorPool();
    const job = await new ConnectorService(pool as never, {} as never).claimNext(11, 1);
    expect(job).toMatchObject({ id: 22, companyId: 1 });
    expect(pool.companyFilter).toBe(1);
  });

  it('conector não conclui job de outra empresa', async () => {
    const pool = new ConnectorPool();
    await expect(new ConnectorService(pool as never, {} as never).complete(99, 11, 1, 'ok'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('listagem administrativa recebe filtro da empresa', async () => {
    const pool = new ConnectorPool();
    await new ConnectorService(pool as never, {} as never).listJobs(1, 100);
    expect(pool.companyFilter).toBe(1);
  });
});
