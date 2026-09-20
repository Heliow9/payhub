import { describe, expect, it } from 'vitest';
import { hashSecret } from '../core/security.js';
import { assertFullEmployeeAccess, contextFromPrincipal } from '../core/tenant.js';
import { AuthService } from '../services/auth.service.js';

describe('contexto empresarial', () => {
  it('produz contexto da empresa do principal administrativo', () => {
    expect(contextFromPrincipal({
      kind: 'USER',
      id: 7,
      companyId: 3,
      companyName: 'ACME',
      name: 'Ana',
      email: 'a@acme.com',
      role: 'MASTER',
      status: 'ACTIVE',
    })).toMatchObject({ companyId: 3, userId: 7, role: 'MASTER' });
  });

  it('bloqueia mutação para vínculo histórico', () => {
    expect(() => assertFullEmployeeAccess({
      kind: 'EMPLOYEE',
      id: 9,
      identityId: 4,
      companyId: 3,
      companyName: 'ACME',
      name: 'João',
      cpf: '00000000000',
      status: 'TERMINATED',
      accessMode: 'HISTORICAL',
    })).toThrow(/histórico/i);
  });

  it('inclui a empresa do usuário na sessão administrativa', async () => {
    const passwordHash = await hashSecret('Senha#123456');
    let insertedSession: unknown[] | undefined;
    const pool = {
      execute: async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM users')) return [[{
          id: 7,
          companyId: 3,
          companyName: 'ACME',
          name: 'Ana',
          email: 'a@acme.com',
          password_hash: passwordHash,
          role: 'MASTER',
          status: 'ACTIVE',
        }]];
        if (sql.includes('INSERT INTO sessions')) {
          insertedSession = params;
          return [{ insertId: 11 }];
        }
        return [{ affectedRows: 1 }];
      },
    };
    const audit = { record: async () => undefined };
    const auth = new AuthService(pool as never, {
      SESSION_TTL_HOURS: 12,
      EMPLOYEE_SESSION_TTL_HOURS: 12,
    } as never, audit as never);

    const result = await auth.adminLogin('A@ACME.COM', 'Senha#123456', { ipAddress: null, userAgent: null });

    expect(result.principal).toMatchObject({ companyId: 3, companyName: 'ACME' });
    expect(insertedSession?.[1]).toBe(3);
  });
});
