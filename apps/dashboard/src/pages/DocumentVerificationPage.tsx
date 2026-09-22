import { useEffect,useState, type FormEvent } from 'react';
import { api,ApiError } from '../api/client';
import { FullBrand } from '../components/Brand';

function normalize(value:string){return value.trim().toUpperCase().replace(/\s+/g,'');}
function boolLabel(value:boolean|null|undefined){if(value===true)return'OK';if(value===false)return'Falha';return'Não aplicável';}
async function fileSha256(file:File):Promise<string>{
  const buffer=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
}

export function DocumentVerificationPage(){
  const params=new URLSearchParams(window.location.hash.split('?')[1]??window.location.search);
  const [code,setCode]=useState(params.get('codigo')??'');
  const [result,setResult]=useState<any>(null);
  const [fileResult,setFileResult]=useState<any>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [fileBusy,setFileBusy]=useState(false);

  async function verify(e?:FormEvent){
    e?.preventDefault();
    const value=normalize(code);
    if(!value)return;
    setLoading(true);setError('');setResult(null);setFileResult(null);
    try{
      const data=await api.verifyDocument(value);
      setCode(value);setResult(data);
      const url=new URL(window.location.href);url.hash=`/verificar?codigo=${encodeURIComponent(value)}`;history.replaceState(null,'',url);
    }catch(err){
      setError(err instanceof ApiError&&err.status===404?'Código não localizado no PayHub.':err instanceof Error?err.message:'Não foi possível verificar o documento.');
    }finally{setLoading(false);}
  }

  useEffect(()=>{if(code.trim())void verify();},[]);

  async function compareFile(file:File|null){
    if(!file||!result)return;
    setFileBusy(true);setFileResult(null);setError('');
    try{
      const hash=await fileSha256(file);
      const compared=await api.verifyDocumentFileHash(result.document.number,hash);
      setFileResult({...compared,hash});
    }catch(err){setError(err instanceof Error?err.message:'Falha ao analisar o arquivo.');}
    finally{setFileBusy(false);}
  }

  const integrity=result?.integrity;
  return <main className="verify-shell">
    <header className="verify-top"><a href="/#/"><FullBrand className="verify-brand"/></a><a className="verify-login-link" href="/#/">Acessar PayHub</a></header>
    <section className="verify-hero">
      <span className="eyebrow">CONFERÊNCIA DOCUMENTAL</span>
      <h1>Verifique a autenticidade de um holerite PayHub</h1>
      <p>Informe o código impresso no documento. A análise confere o registro, os hashes armazenados, a cadeia de assinatura e, quando houver, o carimbo de tempo.</p>
      <form className="verify-form" onSubmit={verify}>
        <input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="PH-202609-XXXX-XXXX-XXXX" autoCapitalize="characters" spellCheck={false}/>
        <button className="primary-button" disabled={loading}>{loading?'Verificando…':'Verificar documento'}</button>
      </form>
      {error&&<div className="form-error">{error}</div>}
    </section>

    {result&&<section className="verify-results">
      <div className={`verify-status ${result.technicalIntegrity?'ok':'alert'}`}>
        <div className="verify-status-icon">{result.technicalIntegrity?'✓':'!'}</div>
        <div><span className="eyebrow">{result.signed?'DOCUMENTO ASSINADO':'DOCUMENTO REGISTRADO'}</span>
          <h2>{result.technicalIntegrity?'Integridade técnica confirmada':'Foi detectada uma inconsistência'}</h2>
          <p>{result.historical?'Este código corresponde a uma versão histórica do holerite. ':'Este código corresponde ao registro localizado no PayHub. '}{result.note}</p>
        </div>
      </div>

      <div className="verify-grid">
        <article className="verify-card"><span className="eyebrow">IDENTIFICAÇÃO</span>
          <dl>
            <div><dt>Código</dt><dd>{result.document.number}</dd></div>
            <div><dt>Empresa</dt><dd>{result.document.companyName}</dd></div>
            <div><dt>Funcionário</dt><dd>{result.document.employeeName}</dd></div>
            <div><dt>CPF</dt><dd>{result.document.cpfMasked}</dd></div>
            <div><dt>Competência</dt><dd>{result.document.competence}</dd></div>
            <div><dt>Tipo</dt><dd>{result.document.payrollTypeLabel}</dd></div>
            <div><dt>Status</dt><dd>{result.document.status}</dd></div>
            <div><dt>Versão</dt><dd>{result.document.version}{result.historical?' (histórica)':''}</dd></div>
          </dl>
        </article>

        <article className="verify-card"><span className="eyebrow">INTEGRIDADE CRIPTOGRÁFICA</span>
          <dl>
            <div><dt>PDF original</dt><dd>{boolLabel(integrity.originalPdf.storageMatch)}</dd></div>
            <div><dt>PDF assinado</dt><dd>{boolLabel(integrity.signedPdf.storageMatch)}</dd></div>
            <div><dt>Hash da evidência</dt><dd>{boolLabel(integrity.evidence.hashMatch)}</dd></div>
            <div><dt>Selo HMAC</dt><dd>{boolLabel(integrity.evidence.hmacSealMatch)}</dd></div>
            <div><dt>Vínculo evidência/PDF</dt><dd>{boolLabel(integrity.evidence.documentLinksMatch)}</dd></div>
            <div><dt>Cadeia de eventos</dt><dd>{boolLabel(integrity.signatureEventChain)}</dd></div>
            <div><dt>TSA RFC 3161</dt><dd>{integrity.tsa.label}</dd></div>
          </dl>
        </article>
      </div>

      <article className="verify-file-card">
        <div><span className="eyebrow">CONFERIR O ARQUIVO RECEBIDO</span><h3>Compare o PDF com o registro do PayHub</h3>
          <p>O SHA-256 é calculado no seu navegador. O PDF não é enviado ao servidor; somente o hash é comparado.</p></div>
        <label className="verify-file-button">{fileBusy?'Calculando hash…':'Selecionar PDF'}<input type="file" accept="application/pdf" disabled={fileBusy} onChange={(e)=>void compareFile(e.target.files?.[0]??null)}/></label>
        {fileResult&&<div className={`verify-file-result ${fileResult.matches?'ok':'alert'}`}>
          {fileResult.matches?`Arquivo correspondente ao ${fileResult.match==='SIGNED'?'PDF assinado':'PDF original'} registrado.`:'O arquivo selecionado não corresponde aos hashes registrados para este código.'}
        </div>}
      </article>
    </section>}

    <footer className="verify-footer">PayHub • Conferência pública de integridade documental</footer>
  </main>;
}
