import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { clearRememberedEmail, getRememberedEmail, saveRememberedEmail } from '../auth/remember-email';
import { FullBrand,Brand } from '../components/Brand';

function cpfMask(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function LoginPage() {
  const { login, firstAccess } = useAuth();
  const rememberedEmail = useMemo(() => getRememberedEmail(), []);
  const [identifier, setIdentifier] = useState(rememberedEmail);
  const [rememberEmail, setRememberEmail] = useState(Boolean(rememberedEmail));
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [first, setFirst] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const employeeMode = useMemo(() => /^\d/.test(identifier.trim()), [identifier]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(identifier, password);
      if (!employeeMode) {
        if (rememberEmail) saveRememberedEmail(identifier);
        else clearRememberedEmail();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PIN_NOT_SET') {
        setFirst(true);
        setError('Primeiro acesso: confirme seus dados e crie seu PIN de 6 dígitos.');
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (pin !== confirm) { setError('Os PINs não conferem.'); return; }
    if (!/^\d{6}$/.test(pin)) { setError('O PIN deve possuir exatamente 6 números.'); return; }
    setLoading(true);
    setError('');
    try { await firstAccess(identifier, birthDate, pin); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha no primeiro acesso.'); }
    finally { setLoading(false); }
  }

  return <main className="login-shell">
    <section className="login-brand-panel">
      <FullBrand className="login-full-brand"/><span className="eyebrow light">GESTÃO DIGITAL DE HOLERITES</span>
      <h1>Seu holerite.<br/>Seguro, simples e rastreável.</h1>
      <p>Acesso unificado para administração e funcionários, com integração Sage e assinatura eletrônica reforçada.</p>
      <div className="login-points"><span>✓ Integridade SHA-256</span><span>✓ Auditoria completa</span><span>✓ Assinatura com PIN</span></div>
    </section>
    <section className="login-form-panel"><div className="login-card">
      <div className="mobile-brand"><Brand compact/></div>
      <span className="eyebrow">ACESSO ÚNICO</span><h2>{first ? 'Ative seu acesso' : 'Bem-vindo ao PayHub'}</h2>
      <p>{first ? 'Confirme sua identidade e defina o PIN que será usado nos próximos acessos.' : employeeMode ? 'Acesso de funcionário identificado: informe seu CPF e PIN de 6 dígitos.' : 'Use o mesmo acesso para administração e funcionários. Administradores entram com e-mail e senha; funcionários entram com CPF e PIN.'}</p>
      {!first&&<div className="login-access-hints"><span><b>Administrativo</b>E-mail + senha</span><span><b>Funcionário</b>CPF + PIN</span></div>}
      {!first ? <form onSubmit={submit}>
        <label>{employeeMode ? 'CPF' : 'E-mail ou CPF'}
          <input inputMode={employeeMode ? 'numeric' : 'email'} autoComplete="username" value={identifier}
            onChange={(e) => { const v=e.target.value; if (/^\d/.test(v) || employeeMode) setIdentifier(cpfMask(v)); else setIdentifier(v); }}
            placeholder={employeeMode ? '000.000.000-00' : 'nome@empresa.com.br ou CPF'} required/>
        </label>
        <label>{employeeMode ? 'PIN de 6 dígitos' : 'Senha'}
          <input type="password" inputMode={employeeMode ? 'numeric' : undefined} maxLength={employeeMode ? 6 : 128} autoComplete="current-password" value={password}
            onChange={(e) => setPassword(employeeMode ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)} required/>
        </label>
        {!employeeMode && <label className="remember-email"><input type="checkbox" checked={rememberEmail} onChange={(e)=>{const checked=e.target.checked;setRememberEmail(checked);if(!checked)clearRememberedEmail();}}/><span>Lembrar e-mail neste dispositivo</span></label>}
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form> : <form onSubmit={activate}>
        <label>CPF<input value={identifier} disabled/></label>
        <label>Data de nascimento<input type="date" value={birthDate} onChange={(e)=>setBirthDate(e.target.value)} required/></label>
        <div className="form-grid two">
          <label>Novo PIN<input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g, '').slice(0,6))} required/></label>
          <label>Confirmar PIN<input type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(e)=>setConfirm(e.target.value.replace(/\D/g, '').slice(0,6))} required/></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Ativando…' : 'Ativar e entrar'}</button>
        <button type="button" className="link-button" onClick={()=>{setFirst(false);setError('');}}>Voltar ao login</button>
      </form>}
      <div className="security-note">Sessão protegida • Credenciais criptografadas • Auditoria</div>
    </div></section>
  </main>;
}
