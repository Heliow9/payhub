import { brMoney,eventCodeOf,monthName,natureLabel,padEventCode,parseCompetence,payrollBases,sortPayrollItems } from './payroll-document-utils';

const COMPANY={name:'REAL ENERGY LTDA',address:'RUA BEIRA CANAL, 49',document:'41.116.138/0001-38 OLINDA PE',unit:'REAL ENERGY - PE'};

function value(data:any,...keys:string[]):any{for(const key of keys){if(data?.[key]!==undefined&&data?.[key]!==null)return data[key];}return null;}
function dateBr(raw:any):string{if(!raw)return'—';const date=new Date(String(raw).slice(0,10)+'T12:00:00');return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('pt-BR');}

export function PayrollDocument({data,className=''}:{data:any;className?:string}){
  const competence=parseCompetence(data);
  const items=sortPayrollItems(data?.items??[]);
  const bases=payrollBases(data);
  const gross=value(data,'gross_amount','grossAmount','gross');
  const deductions=value(data,'deduction_amount','deductionAmount','deductions');
  const net=value(data,'net_amount','netAmount','net');
  const sageCode=String(value(data,'sageCode','sage_employee_code','sageEmployeeCode')??'');
  const employeeName=String(value(data,'employeeName','name')??'—').toUpperCase();
  const jobTitle=String(value(data,'jobTitle','job_title')??'—').toUpperCase();
  const admission=value(data,'admissionDate','admission_date');
  return <div className={`sage-holerite ${className}`.trim()}>
    <div className="sage-holerite-head">
      <div className="sage-company"><strong>{COMPANY.name}</strong><span>{COMPANY.address}</span><span>{COMPANY.document}</span><span>{COMPANY.name} / {COMPANY.address.replace(', ',',')}</span></div>
      <div className="sage-title"><strong>Recibo de Pagamento de Salário</strong><span>Mês: {competence.label}</span></div>
    </div>
    <div className="sage-employee-grid">
      <div><small>Código</small><strong>{sageCode.padStart(5,'0')||'—'}</strong></div>
      <div className="grow-cell"><small>Nome do Funcionário</small><strong>{employeeName}</strong><span>{jobTitle}</span></div>
      <div><small>CBO</small><strong>{String(value(data,'cbo')??'—')}</strong></div>
      <div><small>Emp.</small><strong>001</strong></div>
      <div><small>Local</small><strong>001</strong></div>
      <div><small>Depto.</small><strong>001</strong></div>
      <div><small>Setor</small><strong>000</strong></div>
      <div><small>Seção</small><strong>000</strong></div>
      <div className="admission-cell"><small>Admissão</small><strong>{dateBr(admission)}</strong><span>{COMPANY.unit}</span></div>
    </div>
    <div className="sage-events-wrap">
      <table className="sage-events">
        <thead><tr><th>Cód.</th><th>Descrição</th><th>Referência</th><th>Vencimentos</th><th>Descontos</th></tr></thead>
        <tbody>{items.map((item:any,index:number)=>{const nature=String(item.nature??'').toUpperCase();const amount=brMoney(item.amount);return <tr key={`${eventCodeOf(item)}-${index}`}><td>{padEventCode(eventCodeOf(item))}</td><td>{String(item.description??'')}</td><td>{item.referenceValue??item.reference??'—'}</td><td className="money-cell">{nature==='EARNING'?amount:''}</td><td className="money-cell">{nature==='DEDUCTION'?amount:''}</td></tr>;})}</tbody>
        <tfoot>
          <tr className="sage-totals-label"><td colSpan={3}/><td>Total de Vencimentos</td><td>Total de Descontos</td></tr>
          <tr className="sage-totals-value"><td colSpan={3}/><td>{brMoney(gross)}</td><td>{brMoney(deductions)}</td></tr>
          <tr className="sage-net"><td colSpan={3}/><td>Valor Líquido</td><td>{brMoney(net)}</td></tr>
        </tfoot>
      </table>
      <aside className="sage-signature-strip"><span>DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO</span><div className="signature-line"/><strong>ASSINATURA DO FUNCIONÁRIO</strong><div className="date-line">DATA</div></aside>
    </div>
    <div className="sage-bases">
      <div><span>Salário Base</span><strong>{brMoney(bases.salaryBase)}</strong></div>
      <div><span>Sal. Contr. INSS</span><strong>{brMoney(bases.inssBase)}</strong></div>
      <div><span>Base Cálc. FGTS</span><strong>{brMoney(bases.fgtsBase)}</strong></div>
      <div><span>FGTS do mês</span><strong>{brMoney(bases.fgtsMonth)}</strong></div>
      <div><span>Base Cálc. IRRF</span><strong>{brMoney(bases.irrfBase)}</strong></div>
      <div><span>Faixa IRRF</span><strong>{brMoney(bases.irrfBracket)}</strong></div>
    </div>
    <div className="sage-accessibility-nature" aria-hidden="true">{items.map((item:any)=>natureLabel(item.nature)).join(' · ')}</div>
  </div>;
}
