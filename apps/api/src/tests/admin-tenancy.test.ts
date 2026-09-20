import { describe, expect, it } from 'vitest';
import { CompanyProvisioningService } from '../services/company-provisioning.service.js';
import { AuthService } from '../services/auth.service.js';

const input = {
  legalName: 'Empresa Nova Ltda', displayName: 'Empresa Nova', slug: 'empresa-nova', sageCompanyCode: '2',
  master: { name: 'Master Nova', email: 'master@nova.test', password: 'senha-segura-123' },
  externalSource: 'ponto-certo', externalId: 'tenant-2', idempotencyKey: 'tenant-2',
};

class ProvisionPool {
  log: string[] = [];
  existingEmail = false;
  getConnection() {
    const self = this;
    return Promise.resolve({
      beginTransaction: async () => { self.log.push('BEGIN'); },
      commit: async () => { self.log.push('COMMIT'); },
      rollback: async () => { self.log.push('ROLLBACK'); }, release: () => undefined,
      execute: async (sql: string) => {
        if (sql.includes('FROM companies') && sql.includes('external_source')) return [[]];
        if (sql.includes('FROM users') && sql.includes('email')) return [self.existingEmail ? [{ id: 1 }] : []];
        if (sql.includes('INSERT INTO companies')) { self.log.push('INSERT companies'); return [{ insertId: 2 }]; }
        if (sql.includes('INSERT INTO users')) { self.log.push('INSERT users MASTER'); return [{ insertId: 9 }]; }
        if (sql.includes('INSERT INTO company_masters')) self.log.push('INSERT company_masters');
        if (sql.includes('INSERT INTO app_settings')) self.log.push('INSERT settings');
        return [{ affectedRows: 1 }];
      },
    });
  }
}

describe('administração multiempresa', () => {
  it('cria empresa, único MASTER e settings na mesma transação', async () => {
    const pool = new ProvisionPool();
    const result = await new CompanyProvisioningService(pool as never).provision(input);
    expect(result).toEqual({ companyId: 2, masterUserId: 9, alreadyProvisioned: false });
    expect(pool.log).toEqual(['BEGIN', 'INSERT companies', 'INSERT users MASTER', 'INSERT company_masters', 'INSERT settings', 'COMMIT']);
  });

  it('recusa e-mail administrativo já existente globalmente', async () => {
    const pool = new ProvisionPool(); pool.existingEmail = true;
    await expect(new CompanyProvisioningService(pool as never).provision(input)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    expect(pool.log).toContain('ROLLBACK');
  });

  it('força a empresa da sessão ao criar analista', async () => {
    let insert = { sql: '', params: [] as unknown[] };
    const pool = { execute: async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO users')) { insert = { sql, params }; return [{ insertId: 21 }]; }
      return [{ affectedRows: 1 }];
    } };
    const auth = new AuthService(pool as never, {} as never, { record: async () => undefined } as never);
    await auth.createAnalyst({ kind: 'USER', companyId: 7, userId: 1, role: 'MASTER' }, 'Analista', 'analista@nova.test', 'senha-segura-123', { ipAddress: null, userAgent: null });
    expect(insert.sql).toContain('company_id');
    expect(insert.params[0]).toBe(7);
  });

  it('autentica MASTER somente quando ele é o titular registrado da empresa', async () => {
    let loginSql = '';
    const pool = {
      execute: async (sql: string) => {
        if (sql.includes('FROM users')) { loginSql = sql; return [[]]; }
        return [{ affectedRows: 1 }];
      },
    };

    await expect(new AuthService(pool as never, {} as never, {} as never)
      .adminLogin('master@nova.test', 'senha', { ipAddress: null, userAgent: null }))
      .rejects.toMatchObject({ statusCode: 401 });
    expect(loginSql).toContain('company_masters');
  });
});
