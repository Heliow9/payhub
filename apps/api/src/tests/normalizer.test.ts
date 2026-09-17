import { describe, expect, it } from 'vitest';
import { normalizePayrollBatches } from '../services/normalizer.service.js';

describe('normalização Sage', () => {
  it('normaliza eventos e calcula líquido', () => {
    const payrolls = normalizePayrollBatches([
      { sourceTable: 'MovCapa', rows: [{ cd_funcionario: 4301, ano: 2026, mes: 9, tipo: 2 }] },
      { sourceTable: 'MovEvento', rows: [
        { cd_funcionario: 4301, ano: 2026, mes: 9, tipo: 2, cd_evento: 1, valor: '2000,00', tp_evento: 'P' },
        { cd_funcionario: 4301, ano: 2026, mes: 9, tipo: 2, cd_evento: 2, valor: '200,00', tp_evento: 'D' }
      ]},
      { sourceTable: 'ProcEvento', rows: [
        { cd_evento: 1, ds_evento: 'SALARIO' },
        { cd_evento: 2, ds_evento: 'INSS' }
      ]}
    ], ['4301']);
    expect(payrolls).toHaveLength(1);
    expect(payrolls[0]?.gross).toBe(2000);
    expect(payrolls[0]?.deductions).toBe(200);
    expect(payrolls[0]?.net).toBe(1800);
    expect(payrolls[0]?.payrollTypeLabel).toBe('Mensal');
  });

  it('reconhece evento 180 como rescisão mesmo no tipo 2', () => {
    const [payroll] = normalizePayrollBatches([
      { sourceTable: 'MovEvento', rows: [{ cd_funcionario: '9', ano: 2026, mes: 9, tipo: 2, cd_evento: 180, valor: 1 }] },
      { sourceTable: 'ProcEvento', rows: [{ cd_evento: 180, ds_evento: 'LIQUIDO RESCISAO' }] }
    ], ['9']);
    expect(payroll?.payrollTypeLabel).toBe('Rescisão');
  });
});
