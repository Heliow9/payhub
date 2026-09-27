import { useEffect, useState } from 'react';
import { api } from '../api/client';

const payrollTypeOptions = [
  { value: 2, label: '2 — Mensal', description: 'Folha mensal do funcionário.' },
  { value: 3, label: '3 — Adiantamento 13º', description: 'Adiantamento da primeira parcela do 13º.' },
  { value: 4, label: '4 — 13º salário', description: 'Processamento do 13º salário.' },
  { value: 6, label: '6 — Rescisão', description: 'Documentos de processamento rescisório.' },
];

export function SettingsPage() {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings().then((response) => setForm({
      ...response.settings,
      enabledPayrollTypes: response.settings?.enabledPayrollTypes ?? [2, 3, 4, 6],
    })).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha'));
  }, []);

  if (!form) return <section><div className="page-heading"><h1>Configurações</h1></div><div className="empty-state">Carregando…</div></section>;

  function togglePayrollType(value: number) {
    setForm((current: any) => {
      const enabled = current.enabledPayrollTypes ?? [];
      return { ...current, enabledPayrollTypes: enabled.includes(value) ? enabled.filter((item: number) => item !== value) : [...enabled, value].sort((a: number, b: number) => a - b) };
    });
  }

  async function save() {
    setSaving(true); setError(''); setSaved('');
    try {
      await api.updateSettings({
        signatureMode: form.signatureMode,
        signatureLinkTtlMinutes: Number(form.signatureLinkTtlMinutes),
        acceptanceText: form.acceptanceText,
        enabledPayrollTypes: form.enabledPayrollTypes ?? [],
      });
      setSaved('Configurações salvas com sucesso.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setSaving(false); }
  }

  return <section>
    <div className="page-heading"><span className="eyebrow">MASTER</span><h1>Configurações de segurança</h1><p>Defina o padrão de assinatura, validade dos links e os tipos de holerite permitidos para a empresa. Analistas não podem alterar estas regras.</p></div>
    {error && <div className="form-error">{error}</div>}{saved && <div className="success-note">{saved}</div>}
    <div className="settings-grid">
      <div className="panel"><span className="eyebrow">ASSINATURA</span><h3>Método padrão</h3><div className="choice-list"><label className={`choice ${form.signatureMode==='ACCEPT'?'selected':''}`}><input type="radio" name="mode" checked={form.signatureMode==='ACCEPT'} onChange={()=>setForm({...form,signatureMode:'ACCEPT'})}/><div><strong>Aceite eletrônico autenticado</strong><span>PIN + aceite + evidências criptográficas.</span></div></label><label className={`choice ${form.signatureMode==='ACCEPT_AND_DRAW'?'selected':''}`}><input type="radio" name="mode" checked={form.signatureMode==='ACCEPT_AND_DRAW'} onChange={()=>setForm({...form,signatureMode:'ACCEPT_AND_DRAW'})}/><div><strong>Aceite + assinatura desenhada</strong><span>Adiciona assinatura manuscrita em tela ao pacote de evidências.</span></div></label></div></div>
      <div className="panel"><span className="eyebrow">LINK TEMPORÁRIO</span><h3>Validade padrão</h3><label>Minutos<input type="number" min={5} max={43200} value={form.signatureLinkTtlMinutes} onChange={(e)=>setForm({...form,signatureLinkTtlMinutes:e.target.value})}/></label><p className="muted">Ex.: 1440 = 24 horas. O link é único e deixa de ser utilizável após a assinatura.</p></div>
      <div className="panel span-2"><span className="eyebrow">GERAÇÃO DE DOCUMENTOS</span><h3>Tipos de holerite ativos</h3><p className="muted small">Somente o MASTER pode alterar esta política. Tipos desativados ficam indisponíveis em novas buscas individuais, manuais e automáticas. Holerites já gerados e configurações históricas dos grupos são preservados.</p><div className="check-grid">{payrollTypeOptions.map((option)=>{const active=(form.enabledPayrollTypes??[]).includes(option.value);return <label className={`check-card ${active?'selected':''}`} key={option.value}><input type="checkbox" checked={active} onChange={()=>togglePayrollType(option.value)}/><span><strong>{option.label}</strong><small>{active?'Ativo para novas buscas':'Inativo para novas buscas'} · {option.description}</small></span></label>;})}</div>{(form.enabledPayrollTypes??[]).length===0&&<div className="warning-note compact-note"><strong>Geração suspensa.</strong><span>Nenhum tipo de holerite está ativo. Novas buscas serão bloqueadas até que o MASTER reative ao menos um tipo.</span></div>}</div>
      <div className="panel span-2"><span className="eyebrow">DECLARAÇÃO</span><h3>Texto de aceite</h3><textarea rows={5} value={form.acceptanceText} onChange={(e)=>setForm({...form,acceptanceText:e.target.value})}/><p className="muted small">A versão e o hash deste texto são armazenados junto à evidência. O PayHub acrescenta automaticamente a declaração obrigatória sobre IP, dispositivo, sessão, integridade, localização quando disponível e assinatura desenhada quando utilizada.</p></div>
      <div className="panel span-2 security-features"><div><strong>SHA-256</strong><span>Integridade do PDF original e assinado</span></div><div><strong>Selo HMAC</strong><span>Envelope de evidências assinado pelo PayHub</span></div><div><strong>Carimbo externo</strong><span>RFC 3161 quando TSA_URL estiver configurado</span></div><div><strong>Cadeia de eventos</strong><span>Hashes encadeados para detectar alterações</span></div></div>
    </div>
    <div className="save-bar"><button className="primary-button" disabled={saving} onClick={()=>void save()}>{saving?'Salvando…':'Salvar configurações'}</button></div>
  </section>;
}
