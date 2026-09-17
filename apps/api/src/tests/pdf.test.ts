import { describe, expect, it } from 'vitest';
import { buildPayrollPdf } from '../services/pdf.service.js';

describe('PDF canônico do holerite', () => {
  it('gera duas vias no padrão do recibo Sage com vencimentos e descontos separados', () => {
    const pdf = buildPayrollPdf({
      employeeName:'HELIO ADRIANO DO REGO LIVRAMENTO',
      cpfMasked:'***.***.***-25',
      sageCode:'4301',
      competence:'01/2025',
      typeLabel:'Mensal',
      jobTitle:'TECNICO INFORMATICA',
      admissionDate:'2018-09-03',
      gross:2706.37,
      deductions:571.17,
      net:2135.20,
      salaryBase:2134.06,
      inssBase:2345.52,
      fgtsBase:2345.52,
      fgtsMonth:187.64,
      irrfBase:2345.52,
      irrfBracket:0,
      items:[
        {code:'1',description:'SALARIO NORMAL',reference:'30/30',amount:2134.06,nature:'EARNING'},
        {code:'18',description:'INTEGRACAO HORA EXTRA NO DSR',reference:'05/26',amount:43.92,nature:'EARNING'},
        {code:'76',description:'DESCONTO DE ATRASOS',reference:'14:37',amount:161.71,nature:'DEDUCTION'}
      ]
    });
    const raw=pdf.toString('latin1');
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect((raw.match(/Recibo de Pagamento de Salário/g)??[])).toHaveLength(2);
    expect(raw).toContain('Vencimentos');
    expect(raw).toContain('Descontos');
    expect(raw).toContain('SALARIO NORMAL');
    expect(raw).toContain('INTEGRACAO HORA EXTRA NO DSR');
    expect(raw).toContain('Valor Liquido');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
