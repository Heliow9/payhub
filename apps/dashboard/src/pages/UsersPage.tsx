import { useEffect, useState, type FormEvent } from 'react';
import { client, type PayHubUser } from '../api/client';

export function UsersPage({ csrfToken }: { csrfToken: string }) {
  const [users, setUsers] = useState<PayHubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await client.users();
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await client.createAnalyst(form, csrfToken);
      setForm({ name: '', email: '', password: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar Analista.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-heading row-between">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h2>Usuários</h2>
          <p>Gerencie os acessos administrativos do PayHub.</p>
        </div>
        <button className="primary-button compact" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Cancelar' : '+ Novo Analista'}
        </button>
      </div>

      {showForm && (
        <form className="analyst-form" onSubmit={submit}>
          <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></label>
          <label>E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Senha inicial<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} /></label>
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Criar Analista'}</button>
        </form>
      )}

      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="table-card">
        {loading ? <div className="empty-state">Carregando usuários…</div> : (
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong></td>
                  <td>{user.email}</td>
                  <td><span className="badge">{user.role}</span></td>
                  <td><span className="status-dot"><i />{user.status === 'ACTIVE' ? 'Ativo' : 'Desabilitado'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
