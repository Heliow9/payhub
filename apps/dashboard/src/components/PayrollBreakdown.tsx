import { StatusBadge } from './StatusBadge';
import { natureLabel,padEventCode,sortPayrollItems } from './payroll-document-utils';

const money=(v:any)=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const value=(data:any,...keys:string[])=>{for(const key of keys){if(data?.[key]!==undefined&&data?.[key]!==null)return data[key];}return null;};

export function PayrollBreakdown({data,showAcceptance=false}:{data:any;showAcceptance?:boolean}){
  const items=sortPayrollItems(data?.items??[]);
  const type=value(data,'payroll_type_label','payrollTypeLabel','typeLabel')??'—';
  const gross=value(data,'gross_amount','grossAmount','gross');
  const deductions=value(data,'deduction_amount','deductionAmount','deductions');
  const net=value(data,'net_amount','netAmount','net');
  return <div className="payroll-breakdown">
    <div className="payroll-summary"><div><span>Tipo</span><strong>{type}</strong></div><div><span>Vencimentos</span><strong>{money(gross)}</strong></div><div><span>Descontos</span><strong>{money(deductions)}</strong></div><div className="net"><span>Líquido</span><strong>{money(net)}</strong></div></div>
    <div className="section-title"><h3>Eventos da folha</h3>{data?.status&&<StatusBadge status={data.status}/>}</div>
    <div className="table-card inner payroll-events-table"><table><thead><tr><th>Código</th><th>Descrição</th><th>Referência</th><th>Natureza</th><th className="right">Valor</th></tr></thead><tbody>{items.map((i:any,index:number)=><tr key={`${i.eventCode??i.code}-${index}`}><td><code>{padEventCode(i.eventCode??i.code)}</code></td><td>{i.description}</td><td>{i.referenceValue??i.reference??'—'}</td><td><span className={`nature-chip ${String(i.nature).toLowerCase()}`}>{natureLabel(i.nature)}</span></td><td className="right"><strong>{money(i.amount)}</strong></td></tr>)}</tbody></table></div>
    {showAcceptance&&data?.acceptanceText&&<div className="acceptance-box"><strong>Texto de aceite</strong><p>{data.acceptanceText}</p></div>}
  </div>;
}
