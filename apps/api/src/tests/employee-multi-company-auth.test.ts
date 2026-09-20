import { beforeAll, describe, expect, it } from 'vitest';
import { hashSecret, sha256 } from '../core/security.js';
import { AuthService } from '../services/auth.service.js';

const CPF = '52998224725';
const meta = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
let pinHash = '';

beforeAll(async () => { pinHash = await hashSecret('123456'); });

type LinkRow = {
  employeeId: number;
  companyId: number;
  companyName: string;
  name: string;
  status: 'ACTIVE' | 'TERMINATED';
};

class AuthPool {
  public selectionTokenHash = '';

  constructor(
    private links: LinkRow[],
    private selectionIdentityId = 10,
  ) {}

  async execute(sql: string, params: unknown[] = []): Promise<any> {
    if (sql.includes('FROM employee_identities') && sql.includes('WHERE i.cpf')) {
      return [[{
        id: 10,
        cpf: CPF,
        birthDate: '1990-05-20',
        pin_hash: pinHash,
        failed_attempts: 0,
        locked_until: null,
      }]];
    }
    if (sql.includes('FROM employees e') && sql.includes('e.identity_id=?')) return [this.links];
    if (sql.includes('INSERT INTO employee_company_selections')) {
      this.selectionTokenHash = String(params[1]);
      return [{ insertId: 50 }];
    }
    if (sql.includes('INSERT INTO employee_sessions')) return [{ insertId: 60 }];
    return [{ affectedRows: 1 }];
  }

  async getConnection(): Promise<any> {
    return {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
      execute: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM employee_company_selections')) {
          return [[{
            id: 50,
            identityId: this.selectionIdentityId,
            client: 'WEB',
            expiresAt: new Date(Date.now() + 60_000),
          }]];
        }
        if (sql.includes('FROM employees e') && sql.includes('e.identity_id=?')) {
          const companyId = Number(params[1]);
          return [this.links.filter((link) => link.companyId === companyId)];
        }
        if (sql.includes('UPDATE employee_company_selections')) return [{ affectedRows: 1 }];
        if (sql.includes('INSERT INTO employee_sessions')) return [{ insertId: 60 }];
        return [{ affectedRows: 1 }];
      },
    };
  }
}

function authWith(pool: AuthPool) {
  return new AuthService(pool as never, {
    SESSION_TTL_HOURS: 12,
    EMPLOYEE_SESSION_TTL_HOURS: 12,
  } as never, { record: async () => undefined } as never);
}

describe('autenticação multiempresa do funcionário', () => {
  it('reutiliza o PIN global e pede seleção para dois vínculos', async () => {
    const pool = new AuthPool([
      { employeeId: 11, companyId: 1, companyName: 'RealEnergy', name: 'Maria', status: 'TERMINATED' },
      { employeeId: 12, companyId: 2, companyName: 'Empresa Nova', name: 'Maria', status: 'ACTIVE' },
    ]);

    const result = await authWith(pool).employeeLogin(CPF, '123456', meta, 'WEB');

    expect(result).toMatchObject({ requiresCompanySelection: true });
    if (!('requiresCompanySelection' in result)) throw new Error('Seleção esperada.');
    expect(result.companies).toEqual([
      expect.objectContaining({ companyId: 1, status: 'TERMINATED', accessMode: 'HISTORICAL' }),
      expect.objectContaining({ companyId: 2, status: 'ACTIVE', accessMode: 'FULL' }),
    ]);
    expect(pool.selectionTokenHash).toBe(sha256(result.selectionToken));
  });

  it('não compara nascimento novamente quando a identidade já possui PIN', async () => {
    const pool = new AuthPool([
      { employeeId: 12, companyId: 2, companyName: 'Empresa Nova', name: 'Maria', status: 'ACTIVE' },
    ]);

    await expect(authWith(pool).firstAccess(CPF, '1900-01-01', '654321', meta, 'WEB'))
      .rejects.toMatchObject({ code: 'PIN_ALREADY_SET' });
  });

  it('entra diretamente quando existe apenas um vínculo', async () => {
    const pool = new AuthPool([
      { employeeId: 12, companyId: 2, companyName: 'Empresa Nova', name: 'Maria', status: 'ACTIVE' },
    ]);

    const result = await authWith(pool).employeeLogin(CPF, '123456', meta, 'MOBILE');

    expect(result).toMatchObject({ principal: { identityId: 10, companyId: 2, accessMode: 'FULL' } });
  });

  it('token temporário não aceita empresa sem vínculo', async () => {
    const pool = new AuthPool([
      { employeeId: 12, companyId: 2, companyName: 'Empresa Nova', name: 'Maria', status: 'ACTIVE' },
    ]);

    await expect(authWith(pool).selectEmployeeCompany('token', 999, meta))
      .rejects.toMatchObject({ statusCode: 401 });
  });
});
