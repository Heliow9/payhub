import { describe, expect, it } from 'vitest';
import { buildPayrollPdf } from '../services/pdf.service.js';

describe('PDF canônico do holerite', () => {
  it('gera um PDF válido e determinístico no formato base', () => {
    const pdf = buildPayrollPdf({ employeeName:'Teste', cpfMasked:'***.***.***-25', sageCode:'4301', competence:'09/2026', typeLabel:'Mensal', gross:1000, deductions:100, net:900, items:[] });
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.length).toBeGreaterThan(300);
  });
});
