import { describe, expect, it } from 'vitest';
import { buildPayrollPdf, buildSignatureStatusReportPdf } from '../services/pdf.service.js';

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

describe('relatório PDF de assinaturas',()=>{
  it('exibe filtros, dados pessoais e seções sem duplicar linhas',()=>{
    const pdf=buildSignatureStatusReportPdf({
      companyName:'Empresa Teste',statusFilter:'BOTH',costCenter:'Todos',competence:'09/2026',generatedAt:new Date('2026-10-14T23:30:50Z'),
      rows:[
        {employeeId:1,employeeName:'Maria Aparecida da Silva dos Santos Oliveira',cpf:'52998224725',birthDate:'1990-05-20',costCenter:'Operações',year:2026,month:9,payrollTypeLabel:'Mensal',status:'SIGNED',signedAt:new Date('2026-10-08T15:57:01Z') as any},
        {employeeId:2,employeeName:'João dos Santos',cpf:'11144477735',birthDate:'1985-02-03',costCenter:'Financeiro',year:2026,month:9,payrollTypeLabel:'Mensal',status:'VIEWED',signedAt:null}
      ]
    });
    const raw=pdf.toString('latin1');
    expect(pdf.subarray(0,8).toString('latin1')).toBe('%PDF-1.4');
    expect(raw).toContain('Centro de Custo');
    expect(raw).toContain('Situação: Assinados/Falta Assinar');
    expect(raw).toContain('Assinados');
    expect(raw).toContain('Falta Assinar');
    expect(raw).not.toContain('Já assinaram');
    expect(raw).toContain('Maria Aparecida da Silva dos Santos Oliveira');
    expect(raw).toContain('529.982.247-25');
    expect(raw).toContain('20/05/1990');
    expect(raw).toContain('Competência: 09/2026');
    expect(raw).toContain('Gerado em: 14/10/2026 20:30:50');
    expect(raw).toContain('08/10/2026 12:57:01');
    expect(raw).not.toContain('Thu Oct');
    expect(raw).toContain('/MediaBox [0 0 842 595]');
    expect((raw.match(/Maria Aparecida da Silva dos Santos Oliveira/g)??[])).toHaveLength(1);
  });

  it('gera um PDF válido quando nenhum funcionário corresponde aos filtros',()=>{
    const pdf=buildSignatureStatusReportPdf({companyName:'Empresa Teste',statusFilter:'PENDING',costCenter:'Administrativo',competence:'09/2026',generatedAt:new Date('2026-10-14T15:30:00Z'),rows:[]} as any);
    expect(pdf.subarray(0,8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain('Nenhum funcionário encontrado');
  });
});
