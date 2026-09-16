import { useState, type FormEvent } from 'react';

export function LoginPage({ onLogin }: { onLogin(email: string, password: string): Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark">PH</div>
        <span className="eyebrow">GESTÃO DE HOLERITES</span>
        <h1>PayHub</h1>
        <p>Base central para integração, distribuição e assinatura controlada de holerites.</p>
        <div className="security-note">Sessões seguras • Auditoria • Controle por perfil</div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">ACESSO ADMINISTRATIVO</span>
          <h2>Bem-vindo ao PayHub</h2>
          <p>Entre com sua conta Master ou Analista.</p>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
