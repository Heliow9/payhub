import { describe, expect, it } from 'vitest';
import { detectMigrationKeyColumn, incompleteMigrationMessage } from '../db/migrate.js';

describe('executor de migrations', () => {
  it('aceita bancos legados cuja chave de schema_migrations se chama name', () => {
    expect(detectMigrationKeyColumn([{ Field: 'name' }, { Field: 'applied_at' }])).toBe('name');
  });

  it('mantém compatibilidade com bancos cuja chave se chama id', () => {
    expect(detectMigrationKeyColumn([{ Field: 'id' }, { Field: 'applied_at' }])).toBe('id');
  });

  it('bloqueia repetição automática de migration incompleta', () => {
    expect(incompleteMigrationMessage('005_multi_company.sql', 'FAILED')).toMatch(/não execute novamente/i);
  });
});
