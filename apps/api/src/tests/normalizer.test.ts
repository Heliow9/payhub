import { describe, expect, it } from 'vitest';
import { normalizePayrollBatches } from '../services/normalizer.service.js';

describe('normalização Sage', () => {
  it('normaliza a estrutura real do Sage usando ProcEvento como fonte financeira', () => {
    const payrolls = normalizePayrollBatches([
      { sourceTable: 'MovCapa', rows: [{ cd_empresa: 1, cd_funcionario: 4301, mes: 1, ano: 2025, nr_dias_trabalhados: 30 }] },
      { sourceTable: 'MovEvento', rows: [
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, ano: 2025, cd_evento: 1, referencia: 30, tipo_processamento: 2 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, ano: 2025, cd_evento: 76, referencia: 14.37, tipo_processamento: 2 }
      ]},
      { sourceTable: 'ProcEvento', rows: [
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 1, ano: 2025, referencia: 30, referencia_editada: '30/30', valor: 2134.06 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 76, ano: 2025, referencia: 14.37, referencia_editada: '14:37', valor: 161.71 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 79, ano: 2025, referencia: 9, referencia_editada: '09:00', valor: 99.57 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 361, ano: 2025, referencia: 13.51, referencia_editada: '13:51', valor: 228.39 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 99138, ano: 2025, referencia: null, referencia_editada: null, valor: 22 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 18, ano: 2025, referencia: 0, referencia_editada: '05/26', valor: 43.92 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 78, ano: 2025, referencia: 9, referencia_editada: '09:00', valor: 99.57 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 80, ano: 2025, referencia: 0, referencia_editada: '', valor: 188.32 },
        { cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, cd_evento: 369, ano: 2025, referencia: 0, referencia_editada: '', valor: 300 }
      ]},
      { sourceTable: 'EventoGVigencia', rows: [
        { cd_evento: 1, dt_inicio: '2025-01-01T00:00:00', descricao: 'SALÁRIO', tp_evento: 'V' },
        { cd_evento: 18, dt_inicio: '2025-01-01T00:00:00', descricao: 'DSR SOBRE HORAS EXTRAS', tp_evento: 'V' },
        { cd_evento: 76, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESCONTO DE ATRASOS', tp_evento: 'D' },
        { cd_evento: 78, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESCONTO DE FALTAS INTEGRAIS', tp_evento: 'D' },
        { cd_evento: 79, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESCONTO DESCANSO SEM. REMUNER', tp_evento: 'D' },
        { cd_evento: 80, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESCONTO I.N.S.S.', tp_evento: 'D' },
        { cd_evento: 361, dt_inicio: '2025-01-01T00:00:00', descricao: 'HORA EXTRA 070%', tp_evento: 'V' },
        { cd_evento: 369, dt_inicio: '2025-01-01T00:00:00', descricao: 'GRATIFICAÇÃO', tp_evento: 'V' },
        { cd_evento: 99138, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESC ALIMENTACAO VINCULADA PAT', tp_evento: 'D' }
      ]},
      { sourceTable: 'ProcBase', rows: [{ cd_empresa: 1, cd_funcionario: 4301, mes: 1, tipo: 2, ano: 2025, vl_base_rb: 2706.37 }] }
    ], ['4301']);

    expect(payrolls).toHaveLength(1);
    expect(payrolls[0]?.payrollType).toBe(2);
    expect(payrolls[0]?.payrollTypeLabel).toBe('Mensal');
    expect(payrolls[0]?.items).toHaveLength(9);
    expect(payrolls[0]?.gross).toBeCloseTo(2706.37, 2);
    expect(payrolls[0]?.deductions).toBeCloseTo(571.17, 2);
    expect(payrolls[0]?.net).toBeCloseTo(2135.20, 2);
    expect(payrolls[0]?.items.find((item) => item.code === '76')).toMatchObject({ description: 'DESCONTO DE ATRASOS', reference: '14:37', amount: 161.71, nature: 'DEDUCTION' });
    expect(payrolls[0]?.items.find((item) => item.code === '361')).toMatchObject({ description: 'HORA EXTRA 070%', reference: '13:51', amount: 228.39, nature: 'EARNING' });
    expect(payrolls[0]?.items.map((item) => item.code)).toEqual(['1','18','361','369','76','78','79','80','99138']);
  });

  it('usa a vigência de evento aplicável à competência', () => {
    const [payroll] = normalizePayrollBatches([
      { sourceTable: 'ProcEvento', rows: [{ cd_funcionario: 9, ano: 2025, mes: 1, tipo: 2, cd_evento: 76, valor: 100 }] },
      { sourceTable: 'EventoGVigencia', rows: [
        { cd_evento: 76, dt_inicio: '2018-01-01T00:00:00', descricao: 'DESCONTO ANTIGO', tp_evento: 'D' },
        { cd_evento: 76, dt_inicio: '2025-01-01T00:00:00', descricao: 'DESCONTO DE ATRASOS', tp_evento: 'D' },
        { cd_evento: 76, dt_inicio: '2026-01-01T00:00:00', descricao: 'DESCONTO FUTURO', tp_evento: 'D' }
      ]}
    ], ['9']);
    expect(payroll?.items[0]?.description).toBe('DESCONTO DE ATRASOS');
  });

  it('reconhece evento 180 como rescisão mesmo no tipo 2', () => {
    const [payroll] = normalizePayrollBatches([
      { sourceTable: 'ProcEvento', rows: [{ cd_funcionario: '9', ano: 2026, mes: 9, tipo: 2, cd_evento: 180, valor: 1 }] },
      { sourceTable: 'EventoGVigencia', rows: [{ cd_evento: 180, dt_inicio: '2020-01-01T00:00:00', descricao: 'LIQUIDO RESCISAO', tp_evento: 'V' }] }
    ], ['9']);
    expect(payroll?.payrollTypeLabel).toBe('Rescisão');
  });
});
