import { useEffect,useMemo,useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { StatusBadge } from '../components/StatusBadge';
import { PayrollBreakdown } from '../components/PayrollBreakdown';
import { Brand } from '../components/Brand';
import { NotificationCenter } from '../components/NotificationCenter';
import { collectSignatureClientEvidence, signatureOrigin } from '../signature-evidence';

const money=(v:any)=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
type PreparedPayrollDownload={payrollId:number;filename:string;blob:Blob;file:File;competence:string;typeLabel:string};

export function EmployeePortalPage(){
  const{principal,logout}=useAuth();
  const[rows,setRows]=useState<any[]>([]);
  const[detail,setDetail]=useState<any|null>(null);
  const[signing,setSigning]=useState<any|null>(null);
  const[error,setError]=useState('');
  const[filter,setFilter]=useState('');
  const[downloadBusy,setDownloadBusy]=useState<number|null>(null);
  const[preparedDownload,setPreparedDownload]=useState<PreparedPayrollDownload|null>(null);

  async function load(){try{const r=await api.myPayrolls();setRows(r.payrolls);setError('');}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar holerites.');}}
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>filter?rows.filter((p)=>`${String(p.month).padStart(2,'0')}/${p.year}`.includes(filter)):rows,[rows,filter]);

  async function open(id:number){try{const r=await api.myPayroll(id);setDetail(r.payroll);}catch(e){setError(e instanceof Error?e.message:'Falha ao abrir.');}}

  async function preparePayrollDownload(payroll:{id:number;month:number;year:number;payrollTypeLabel?:string;payroll_type_label?:string}){
    setDownloadBusy(payroll.id);setError('');
    try{
      const downloaded=await api.downloadMyPayroll(payroll.id);
      const filename=downloaded.filename.toLowerCase().endsWith('.pdf')?downloaded.filename:`${downloaded.filename}.pdf`;
      const file=new File([downloaded.blob],filename,{type:'application/pdf'});
      setPreparedDownload({payrollId:payroll.id,filename,blob:downloaded.blob,file,competence:`${String(payroll.month).padStart(2,'0')}/${payroll.year}`,typeLabel:String(payroll.payrollTypeLabel??payroll.payroll_type_label??'Holerite')});
    }catch(e){setError(e instanceof Error?e.message:'Falha ao preparar o holerite para download.');}
    finally{setDownloadBusy(null);}
  }

  function downloadPrepared(){
    if(!preparedDownload)return;
    const url=URL.createObjectURL(preparedDownload.blob);
    const a=document.createElement('a');a.href=url;a.download=preparedDownload.filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  }

  async function sharePrepared(){
    if(!preparedDownload)return;
    const nav=navigator as any;
    const data:any={files:[preparedDownload.file],title:`${preparedDownload.typeLabel} ${preparedDownload.competence}`,text:`Holerite assinado · ${preparedDownload.competence}`};
    try{
      if(typeof navigator.share==='function'&&(!nav.canShare||nav.canShare(data))){await navigator.share(data);return;}
      downloadPrepared();
    }catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;setError('Não foi possível abrir o compartilhamento. Use “Baixar PDF” como alternativa.');}
  }

  function exportReport(){const csv=['Competência;Tipo;Status;Bruto;Descontos;Líquido',...rows.map((p)=>`${String(p.month).padStart(2,'0')}/${p.year};${p.payrollTypeLabel};${p.status};${p.grossAmount??''};${p.deductionAmount??''};${p.netAmount??''}`)].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));a.download='meus-holerites.csv';a.click();URL.revokeObjectURL(a.href);}

  return <main className="employee-portal"><header className="employee-header"><Brand subtitle="Portal do funcionário"/><div className="employee-user"><NotificationCenter/><div className="avatar">{principal?.name.slice(0,2).toUpperCase()}</div><div><strong>{principal?.name}</strong><span>Acesso seguro</span></div><button className="ghost-button compact" onClick={()=>void logout()}>Sair</button></div></header><section className="employee-content"><div className="employee-hero"><div><span className="eyebrow light">MEUS DOCUMENTOS</span><h1>Olá, {principal?.name.split(' ')[0]}.</h1><p>Acompanhe seus holerites e conclua assinaturas pendentes.</p></div><div className="hero-stat"><strong>{rows.filter((r)=>['SIGNATURE_REQUESTED','VIEWED'].includes(r.status)).length}</strong><span>pendente(s) de assinatura</span></div></div><div className="employee-toolbar"><div className="search-box"><span>⌕</span><input placeholder="Filtrar por competência, ex.: 09/2026" value={filter} onChange={(e)=>setFilter(e.target.value)}/></div><button className="secondary-button compact" onClick={exportReport}>Relatório CSV</button></div>{error&&<div className="form-error">{error}</div>}<div className="payroll-card-grid">{filtered.map((p)=><article className={`employee-payroll-card ${p.status==='SIGNED'?'signed':''}`} key={p.id}><div className="payroll-card-top"><div className="month-badge"><strong>{String(p.month).padStart(2,'0')}</strong><span>{p.year}</span></div><StatusBadge status={p.status}/></div><h3>{p.payrollTypeLabel}</h3><div className="employee-money"><span>Valor líquido</span><strong>{money(p.netAmount)}</strong></div><div className="employee-payroll-actions"><button className="secondary-button compact" onClick={()=>void open(p.id)}>Visualizar completo</button>{p.status!=='SIGNED'?<button className="primary-button compact" onClick={async()=>{try{const r=await api.myPayroll(p.id);setSigning(r.payroll);}catch(e){setError(e instanceof Error?e.message:'Falha');}}}>Visualizar e assinar</button>:<button className="primary-button compact" disabled={downloadBusy===p.id} onClick={()=>void preparePayrollDownload(p)}>{downloadBusy===p.id?'Preparando PDF…':'Baixar / compartilhar'}</button>}</div>{p.signedAt&&<span className="signed-note">✓ Assinado em {new Date(p.signedAt).toLocaleString('pt-BR')}</span>}</article>)}</div>{filtered.length===0&&<div className="empty-state panel">Nenhum holerite disponível.</div>}</section>{detail&&<EmployeePayrollModal data={detail} onClose={()=>setDetail(null)} onDownload={preparePayrollDownload} busy={downloadBusy===detail.id}/>} {signing&&<SignModal data={signing} onClose={()=>setSigning(null)} onSigned={async()=>{setSigning(null);setDetail(null);await load();}}/>}{preparedDownload&&<Modal title="Holerite pronto" onClose={()=>setPreparedDownload(null)}><div className="form-section"><span className="eyebrow">PDF ASSINADO</span><h3>{preparedDownload.typeLabel} · {preparedDownload.competence}</h3><p className="muted">No iPhone, use <strong>Compartilhar / Salvar no iPhone</strong> para abrir a folha de compartilhamento do iOS. Nela você pode escolher “Salvar em Arquivos”, AirDrop, WhatsApp, e-mail e outros aplicativos.</p></div><div className="modal-actions"><button className="secondary-button" onClick={downloadPrepared}>Baixar PDF</button><button className="primary-button" onClick={()=>void sharePrepared()}>Compartilhar / Salvar no iPhone</button></div></Modal>}</main>;
}

function EmployeePayrollModal({data,onClose,onDownload,busy}:{data:any;onClose():void;onDownload:(data:any)=>Promise<void>;busy:boolean}){return <Modal title={`${String(data.month).padStart(2,'0')}/${data.year} · ${data.payroll_type_label}`} onClose={onClose} wide><PayrollBreakdown data={data}/>{data.status==='SIGNED'&&<div className="modal-actions"><button className="primary-button" disabled={busy} onClick={()=>void onDownload(data)}>{busy?'Preparando PDF…':'Baixar / compartilhar holerite'}</button></div>}</Modal>}

function SignModal({data,onClose,onSigned}:{data:any;onClose():void;onSigned():Promise<void>}){const[pin,setPin]=useState('');const[accepted,setAccepted]=useState(false);const[drawing,setDrawing]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);const requireDraw=data.signatureMode==='ACCEPT_AND_DRAW'||false;async function sign(){if(!accepted){setError('Confirme a declaração de ciência antes de assinar.');return;}setBusy(true);setError('');try{const clientEvidence=await collectSignatureClientEvidence();await api.signPayroll(data.id,{pin,drawing:drawing||undefined,origin:signatureOrigin(),clientEvidence});await onSigned();}catch(e){setError(e instanceof Error?e.message:'Falha ao assinar.');}finally{setBusy(false);}}return <Modal title="Assinar holerite" onClose={onClose} wide><div className="signature-document"><PayrollBreakdown data={data}/><div className="acceptance-box"><label className="accept-check"><input type="checkbox" checked={accepted} onChange={(e)=>setAccepted(e.target.checked)}/><span>{data.acceptanceText}</span></label></div>{requireDraw&&<div className="form-section"><span className="label strong">Assinatura desenhada</span><SignatureCanvas onChange={setDrawing}/></div>}<label>Confirme seu PIN de 6 dígitos<input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="••••••"/></label><div className="signature-security"><span>🔒</span><p>Ao assinar, o PayHub registra data e hora, IP, informações técnicas do dispositivo e navegador/app, sessão, integridade do documento e, quando o dispositivo permitir, localização geográfica com precisão e endereço aproximado. A assinatura desenhada, quando utilizada, permanece armazenada como evidência.</p></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||pin.length!==6||!accepted||(requireDraw&&!drawing)} onClick={()=>void sign()}>{busy?'Assinando…':'Assinar eletronicamente'}</button></div></div></Modal>}
