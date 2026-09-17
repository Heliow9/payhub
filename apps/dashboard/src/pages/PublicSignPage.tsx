import { useEffect,useState } from 'react';
import { api } from '../api/client';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { PayrollDocument } from '../components/PayrollDocument';
import { Brand,FullBrand } from '../components/Brand';

function cpfMask(value:string){const d=value.replace(/\D/g,'').slice(0,11);return d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1-$2');}

export function PublicSignPage({token}:{token:string}){
  const[info,setInfo]=useState<any|null>(null);const[verified,setVerified]=useState<any|null>(null);const[error,setError]=useState('');const[loading,setLoading]=useState(true);const[accepted,setAccepted]=useState(false);const[drawing,setDrawing]=useState('');const[pin,setPin]=useState('');const[cpf,setCpf]=useState('');const[birthDate,setBirthDate]=useState('');const[newPin,setNewPin]=useState('');const[confirm,setConfirm]=useState('');const[signed,setSigned]=useState<any|null>(null);const[busy,setBusy]=useState(false);
  useEffect(()=>{api.publicSignInfo(token).then(setInfo).catch((e)=>setError(e instanceof Error?e.message:'Link inválido.')).finally(()=>setLoading(false));},[token]);
  if(loading)return <main className="public-sign-shell"><div className="public-sign-card"><FullBrand className="public-loading-logo"/><div className="spinner center"/><h2>Validando link seguro…</h2></div></main>;
  if(error&&!info)return <main className="public-sign-shell"><div className="public-sign-card"><div className="error-symbol">!</div><h2>Não foi possível abrir este link</h2><p>{error}</p></div></main>;
  if(signed)return <main className="public-sign-shell"><div className="public-sign-card success-screen"><FullBrand className="public-success-logo"/><div className="success-symbol">✓</div><span className="eyebrow">ASSINATURA CONCLUÍDA</span><h1>Holerite assinado com sucesso</h1><p>A assinatura foi registrada em {signed.signedAt}. O documento ficará disponível no portal do funcionário.</p><div className="security-note">Evidência #{signed.evidenceId} registrada com integridade criptográfica.</div></div></main>;

  const requireDraw=info.signatureMode==='ACCEPT_AND_DRAW';
  async function verify(){if(!info.hasPin&&newPin!==confirm){setError('Os PINs não conferem.');return;}setBusy(true);setError('');try{const body=info.hasPin?{pin}:{cpf,birthDate,newPin};const result=await api.publicSignVerify(token,body);setVerified(result);if(!info.hasPin)setPin(newPin);}catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar sua identidade.');}finally{setBusy(false);}}
  async function sign(){if(!accepted){setError('Confirme a declaração de ciência.');return;}setBusy(true);setError('');try{setSigned(await api.publicSign(token,{pin,drawing:drawing||undefined}));}catch(e){setError(e instanceof Error?e.message:'Não foi possível assinar.');}finally{setBusy(false);}}

  return <main className="public-sign-shell"><div className="public-sign-brand"><Brand subtitle="Assinatura eletrônica segura"/></div><section className="public-sign-card wide-card">
    <div className="public-document-head"><div><span className="eyebrow">HOLERITE PARA ASSINATURA</span><h1>{info.employeeName}</h1><p>{info.cpfMasked}</p></div><div className="document-badge"><strong>{info.competence}</strong><span>{info.payrollTypeLabel}</span></div></div>
    <div className="expiration-note">Este link é pessoal e expira em {new Date(info.expiresAt).toLocaleString('pt-BR')}.</div>
    {!verified ? <>
      {info.hasPin?<div className="form-section"><label>PIN de 6 dígitos<input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="••••••"/></label><p className="field-hint">Confirme sua identidade para visualizar o holerite.</p></div>:<div className="first-access-box"><span className="eyebrow">PRIMEIRO ACESSO</span><h3>Confirme sua identidade</h3><p>Confirme CPF e data de nascimento e crie seu PIN de 6 dígitos.</p><div className="form-grid two"><label>CPF<input inputMode="numeric" value={cpf} onChange={(e)=>setCpf(cpfMask(e.target.value))} placeholder="000.000.000-00"/></label><label>Data de nascimento<input type="date" value={birthDate} onChange={(e)=>setBirthDate(e.target.value)}/></label><label>Novo PIN<input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e)=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><label>Confirmar PIN<input type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(e)=>setConfirm(e.target.value.replace(/\D/g,'').slice(0,6))}/></label></div></div>}
      {error&&<div className="form-error">{error}</div>}<button className="primary-button large" disabled={busy||(info.hasPin?pin.length!==6:(cpf.replace(/\D/g,'').length!==11||!birthDate||newPin.length!==6||newPin!==confirm))} onClick={()=>void verify()}>{busy?'Validando…':'Confirmar identidade e visualizar holerite'}</button>
    </> : <>
      <PayrollDocument data={verified.payroll}/>
      <div className="acceptance-box"><label className="accept-check"><input type="checkbox" checked={accepted} onChange={(e)=>setAccepted(e.target.checked)}/><span>{info.acceptanceText}</span></label></div>
      {requireDraw&&<div className="form-section"><span className="label strong">Assinatura manuscrita em tela</span><SignatureCanvas onChange={setDrawing}/></div>}
      <div className="signature-security"><span>🔒</span><p>A assinatura registra credencial validada, data/hora, IP, dispositivo, hash SHA-256 do PDF e envelope criptográfico de evidências.</p></div>
      {error&&<div className="form-error">{error}</div>}<button className="primary-button large" disabled={busy||!accepted||(requireDraw&&!drawing)} onClick={()=>void sign()}>{busy?'Registrando assinatura…':'Assinar holerite'}</button>
    </>}
  </section></main>;
}
