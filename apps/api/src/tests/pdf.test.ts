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
    expect(raw).toContain('Valor Líquido');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('não deixa a divisória dos totais atravessar o quadro de bases', () => {
    const pdf=buildPayrollPdf({employeeName:'TESTE',cpfMasked:'***',sageCode:'1',competence:'01/2025',typeLabel:'Mensal',gross:100,deductions:10,net:90,salaryBase:100,inssBase:100,fgtsBase:100,fgtsMonth:8,irrfBase:100,irrfBracket:0,items:[{code:'1',description:'SALARIO NORMAL',reference:'30/30',amount:100,nature:'EARNING'}]});
    const raw=pdf.toString('latin1');
    expect(raw).not.toContain('327.00 108.00 m 327.00 25.00 l S');
  });

  it('mantém o texto completo da assinatura eletrônica nas duas vias',()=>{
    const acceptance='Declaro que visualizei o holerite referente à competência informada, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento deste documento. Estou ciente de que o PayHub registra endereço IP, informações técnicas do dispositivo e, quando o dispositivo permitir, localização geográfica com endereço aproximado.';
    const pdf=buildPayrollPdf({employeeName:'HELIO ADRIANO',cpfMasked:'***',sageCode:'4301',competence:'02/2025',typeLabel:'Mensal',gross:2550.77,deductions:634.18,net:1916.59,items:[{code:'1',description:'SALARIO NORMAL',reference:'30/30',amount:2134.06,nature:'EARNING'}],signatureInfo:{signedAt:'17/09/2026 10:50:18 BRT',acceptanceText:acceptance}});
    const raw=pdf.toString('latin1');
    expect((raw.match(/DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO/g)??[])).toHaveLength(2);
    expect((raw.match(/Assinado eletronicamente em 17\/09\/2026 10:50:18 BRT\./g)??[])).toHaveLength(2);
    expect((raw.match(/Declaro que visualizei o holerite referente à competência informada/g)??[])).toHaveLength(2);
    expect(raw).not.toContain('ASSINATURA DO FUNCIONÁRIO');
    expect(raw).not.toContain('(DATA)');
  });

});
