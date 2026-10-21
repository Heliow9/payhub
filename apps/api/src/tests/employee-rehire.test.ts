import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '../services/employee.service.js';

const context = { companyId: 2, userId: 9 } as never;
const meta = { ipAddress: null, userAgent: null };

describe('recontratação no Sage', () => {
  it('seleciona o maior código numérico entre todos os cadastros do mesmo CPF', async () => {
    const source = await readFile(
      new URL('../../../../connector/PayHub.SageConnector/SageReadOnlyClient.cs', import.meta.url),
      'utf8',
    );

    expect(source).toContain('SelectLatestEmployeeCode');
    expect(source).toMatch(/OrderByDescending\(EmployeeCodeRank\)/);
    expect(source).not.toMatch(/employeeCode\s*=\s*Scalar\(row, employeeColumn\);\s*if \(!string\.IsNullOrWhiteSpace\(employeeCode\)\) break;/);
  });

  it('sincroniza o mesmo CPF quando o Sage retorna uma matrícula maior', async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      execute: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('SELECT cpf,sage_employee_code sageEmployeeCode')) {
          return [[{ cpf: '10575342420', sageEmployeeCode: '4301' }]];
        }
        if (sql.includes('UPDATE employees SET')) {
          statements.push({ sql, params });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`SQL inesperado: ${sql}`);
      }),
    };
    const connector = {
      getJob: vi.fn().mockResolvedValue({ jobType: 'EMPLOYEE_LOOKUP_BY_CPF', status: 'COMPLETED' }),
      rawRows: vi.fn().mockResolvedValue([{
        sageEmployeeCode: '4603',
        name: 'Funcionário Recontratado',
        cpf: '10575342420',
        birthDate: '1990-05-20',
        admissionDate: '2026-09-01',
        raw: {},
      }]),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new EmployeeService(pool as never, connector as never, audit as never, {} as never) as any;
    service.refreshUnsignedPayrollDocuments = vi.fn().mockResolvedValue(0);

    await service.applySync(context, 163, 621, meta);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain('sage_employee_code=?');
    expect(statements[0]?.params).toContain('4603');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        previousSageEmployeeCode: '4301',
        sageEmployeeCode: '4603',
      }),
    }));
  });
});
