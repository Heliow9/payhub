import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyMultiCompanyMigration } from '../scripts/verify-multi-company-migration.js';

const sql = fs.readFileSync(new URL('../db/migrations/005_multi_company.sql', import.meta.url), 'utf8');

describe('005_multi_company.sql', () => {
  it('cria identidade global, empresa e isolamento nas raízes', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS companies/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS company_masters/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS employee_identities/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS employee_company_selections/i);
    for (const table of [
      'users',
      'sessions',
      'audit_logs',
      'connectors',
      'import_jobs',
      'employee_groups',
      'employees',
      'employee_sessions',
      'payroll_runs',
      'schedule_executions',
      'payrolls',
      'notifications',
      'push_preferences',
      'push_subscriptions',
    ]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${table}[^;]+company_id`, 'i'));
    }
    expect(sql).toMatch(/ALTER TABLE connector_job_logs[^;]+company_id/i);
    expect(sql).toMatch(/ALTER TABLE connector_raw_batches[^;]+company_id/i);
    expect(sql).toMatch(/ALTER TABLE app_settings[^;]+company_id/i);
    expect(sql).toMatch(/uk_employee_groups_company_name \(company_id, name\)/i);
    const durableSql = fs.readFileSync(new URL('../db/migrations/006_durable_worker.sql', import.meta.url), 'utf8');
    expect(durableSql).toContain('notification_outbox');
    expect(durableSql).toContain('normalization_state');
  });

  it('faz backfill da RealEnergy e preserva credenciais', () => {
    expect(sql).toContain("'realenergy'");
    expect(sql).toMatch(/sage_company_code[^;]*'1'/i);
    expect(sql).toMatch(/INSERT INTO employee_identities[\s\S]+employee_credentials/i);
    expect(sql).toMatch(/UPDATE employees[\s\S]+identity_id/i);
    expect(sql).toMatch(/admin@realenergy\.com\.br/i);
    expect(sql).toMatch(/UPDATE users[\s\S]+company_id/i);
    expect(sql).toMatch(/UPDATE payrolls[\s\S]+company_id/i);
    expect(sql).toMatch(/UPDATE notifications[\s\S]+company_id/i);
  });

  it('verifica que cada empresa ativa possui exatamente um MASTER ativo', async () => {
    let verificationSql = '';
    const pool = {
      query: async (statement: string) => {
        verificationSql = statement;
        return [[]];
      },
    };

    await verifyMultiCompanyMigration(pool as never);

    expect(verificationSql).toContain('companies_without_exactly_one_active_master');
    expect(verificationSql).toMatch(/HAVING COUNT\(u\.id\) <> 1/i);
  });
});

describe('verifyMultiCompanyMigration', () => {
  it('marca como falha qualquer invariante com valor diferente do esperado', async () => {
    const pool = {
      query: async () => [[
        { name: 'realenergy_companies', value: 1, expected: 1 },
        { name: 'users_without_company', value: 0, expected: 0 },
        { name: 'employees_without_identity', value: 2, expected: 0 },
      ]],
    };

    const checks = await verifyMultiCompanyMigration(pool as never);

    expect(checks).toEqual([
      { name: 'realenergy_companies', value: 1, expected: 1, ok: true },
      { name: 'users_without_company', value: 0, expected: 0, ok: true },
      { name: 'employees_without_identity', value: 2, expected: 0, ok: false },
    ]);
  });
});
