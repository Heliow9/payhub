import { canonicalJson } from '../core/json.js';
import { sha256 } from '../core/security.js';

export interface SourceBatch { sourceTable:string; rows:Array<Record<string,unknown>>; }
export interface NormalizedItem { code:string; description:string; reference:string|null; amount:number; nature:'EARNING'|'DEDUCTION'|'BASE'|'OTHER'; }
export interface NormalizedPayroll {
  sageEmployeeCode:string; year:number; month:number; payrollType:number; payrollTypeLabel:string;
  gross:number|null; deductions:number|null; net:number|null; items:NormalizedItem[]; sourceHash:string;
  rawReference:Record<string,unknown>;
}

const typeLabels:Record<number,string>={2:'Mensal',3:'Adiantamento 13º',4:'13º salário',6:'Rescisão'};
const aliases={
  employee:['cd_funcionario','codigo_funcionario','funcionario','id_funcionario','cod_funcionario'],
  year:['ano','nr_ano','ano_referencia','ano_competencia'],
  month:['mes','nr_mes','mes_referencia','mes_competencia'],
  type:['tipo','tp_folha','tipo_folha','cd_tipo'],
  event:['cd_evento','codigo_evento','evento','id_evento'],
  amount:['vl_evento','valor_evento','valor','vlr_evento','vl_calculado','valor_calculado'],
  ref:['referencia','vl_referencia','valor_referencia','quantidade','qtd'],
  desc:['ds_evento','descricao','descricao_evento','nm_evento','nome'],
  nature:['tp_evento','tipo_evento','natureza','fl_provento_desconto','indicador'],
  gross:['vl_bruto','valor_bruto','total_proventos','vl_proventos','proventos'],
  deductions:['vl_desconto','valor_desconto','total_descontos','vl_descontos','descontos'],
  net:['vl_liquido','valor_liquido','liquido','vlr_liquido']
} as const;

function entriesCI(row:Record<string,unknown>):Map<string,unknown>{const m=new Map<string,unknown>();for(const [k,v] of Object.entries(row))m.set(k.toLowerCase(),v);return m;}
function pick(row:Record<string,unknown>, names:readonly string[]):unknown{const m=entriesCI(row);for(const name of names){const v=m.get(name.toLowerCase());if(v!==undefined&&v!==null&&v!=='')return v;}return null;}
function text(v:unknown):string{return v==null?'':String(v).trim();}
function num(v:unknown):number|null{if(v==null||v==='')return null;if(typeof v==='number'&&Number.isFinite(v))return v;const normalized=String(v).trim().replace(/\./g,'').replace(',','.');const n=Number(normalized);return Number.isFinite(n)?n:null;}
function int(v:unknown):number|null{const n=num(v);return n==null?null:Math.trunc(n);}
function same(a:unknown,b:unknown):boolean{return text(a)===text(b);}

function inferNature(row:Record<string,unknown>,description:string,amount:number):NormalizedItem['nature']{
  const raw=text(pick(row,aliases.nature)).toUpperCase();const d=description.toUpperCase();
  if(raw.includes('DESC')||raw==='D'||raw==='2'||d.includes('DESCONTO')||d.includes('INSS')||d.includes('IRRF')||d.includes('FALTA'))return 'DEDUCTION';
  if(raw.includes('PROV')||raw==='P'||raw==='1'||d.includes('SALARIO')||d.includes('HORA EXTRA')||d.includes('ADICIONAL'))return 'EARNING';
  if(raw.includes('BASE')||d.startsWith('BASE '))return 'BASE';
  if(amount<0)return 'DEDUCTION';
  return 'OTHER';
}

export function normalizePayrollBatches(batches:SourceBatch[],targetEmployees:string[]):NormalizedPayroll[]{
  const tables=new Map<string,Array<Record<string,unknown>>>();for(const batch of batches){const key=batch.sourceTable.toLowerCase();tables.set(key,[...(tables.get(key)??[]),...batch.rows]);}
  const capa=tables.get('movcapa')??[];const eventos=tables.get('movevento')??[];const defs=tables.get('procevento')??[];
  const defByCode=new Map<string,Record<string,unknown>>();for(const d of defs){const code=text(pick(d,aliases.event));if(code)defByCode.set(code,d);}
  const employees=new Set(targetEmployees.map(String));const keys=new Map<string,{employee:string;year:number;month:number;type:number;capa?:Record<string,unknown>}>();
  for(const row of capa){const employee=text(pick(row,aliases.employee));const year=int(pick(row,aliases.year));const month=int(pick(row,aliases.month));const type=int(pick(row,aliases.type));if(!employees.has(employee)||!year||!month||!type)continue;keys.set(`${employee}|${year}|${month}|${type}`,{employee,year,month,type,capa:row});}
  for(const row of eventos){const employee=text(pick(row,aliases.employee));const year=int(pick(row,aliases.year));const month=int(pick(row,aliases.month));const type=int(pick(row,aliases.type));if(!employees.has(employee)||!year||!month||!type)continue;const key=`${employee}|${year}|${month}|${type}`;if(!keys.has(key))keys.set(key,{employee,year,month,type});}
  const result:NormalizedPayroll[]=[];
  for(const [key,meta] of keys){
    const eventRows=eventos.filter((r)=>same(pick(r,aliases.employee),meta.employee)&&int(pick(r,aliases.year))===meta.year&&int(pick(r,aliases.month))===meta.month&&int(pick(r,aliases.type))===meta.type);
    const items:NormalizedItem[]=eventRows.map((r)=>{const code=text(pick(r,aliases.event))||'—';const def=defByCode.get(code);const description=text(pick(r,aliases.desc))||text(def?pick(def,aliases.desc):null)||`Evento ${code}`;const amount=num(pick(r,aliases.amount))??0;return{code,description,reference:text(pick(r,aliases.ref))||null,amount:Math.abs(amount),nature:inferNature({...def,...r},description,amount)};});
    const capaRow=meta.capa??{};let gross=num(pick(capaRow,aliases.gross));let deductions=num(pick(capaRow,aliases.deductions));let net=num(pick(capaRow,aliases.net));
    if(gross==null){const earned=items.filter((i)=>i.nature==='EARNING').reduce((s,i)=>s+i.amount,0);gross=earned||null;}
    if(deductions==null){const discounted=items.filter((i)=>i.nature==='DEDUCTION').reduce((s,i)=>s+i.amount,0);deductions=discounted||null;}
    if(net==null&&gross!=null)net=gross-(deductions??0);
    const rawReference={key,capa:capaRow,eventCount:eventRows.length};const sourceHash=sha256(canonicalJson({capa:capaRow,eventos:eventRows,defs:eventRows.map((r)=>defByCode.get(text(pick(r,aliases.event)))??null)}));
    let type=meta.type;let label=typeLabels[type]??`Tipo ${type}`;
    const hasRescisaoEvent=items.some((i)=>i.code==='180'||i.description.toUpperCase().includes('LIQUIDO RESCISAO'));
    if(type===2&&hasRescisaoEvent)label='Rescisão';
    result.push({sageEmployeeCode:meta.employee,year:meta.year,month:meta.month,payrollType:type,payrollTypeLabel:label,gross,deductions,net,items,sourceHash,rawReference});
  }
  return result.sort((a,b)=>a.sageEmployeeCode.localeCompare(b.sageEmployeeCode)||a.year-b.year||a.month-b.month||a.payrollType-b.payrollType);
}
