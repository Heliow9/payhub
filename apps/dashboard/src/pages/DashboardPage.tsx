import { useEffect, useState } from 'react';
import { client, type DashboardSummary, type PayHubUser } from '../api/client';
import { UsersPage } from './UsersPage';
import { SageIntegrationPage } from './SageIntegrationPage';

type Section = 'overview' | 'sage' | 'users';

export function DashboardPage({ user, csrfToken, onLogout }: { user: PayHubUser; csrfToken: string; onLogout(): Promise<void> }) {
  const [section, setSection] = useState<Section>('overview');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    client.dashboard().then(setSummary).catch(() => setSummary(null));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small">PH</div><strong>PayHub</strong></div>
        <nav>
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}>Visão geral</button>
          <button className={section === 'sage' ? 'active' : ''} onClick={() => setSection('sage')}>Integração Sage</button>
          {user.role === 'MASTER' && <button className={section === 'users' ? 'active' : ''} onClick={() => setSection('users')}>Usuários</button>}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></div>
          <button className="ghost-button" onClick={() => void onLogout()}>Sair</button>
        </div>
      </aside>

      <main className="content">
        {section === 'users' && user.role === 'MASTER' ? <UsersPage csrfToken={csrfToken} /> : section === 'sage' ? <SageIntegrationPage user={user} csrfToken={csrfToken} /> : (
          <section>
            <div className="page-heading">
              <span className="eyebrow">CORE PLATFORM</span>
              <h2>Visão geral</h2>
              <p>Fundação operacional do PayHub e preparação das próximas etapas.</p>
            </div>
            <div className="hero-card">
              <div><span className="eyebrow light">AMBIENTE</span><h3>PayHub está pronto para operar o Core.</h3><p>Autenticação, sessão segura, perfis administrativos e auditoria já fazem parte desta etapa.</p></div>
              <span className="online-pill">● Core ativo</span>
            </div>
            <div className="module-grid">
              {(summary?.modules ?? [
                { key: 'core', label: 'Core Platform', status: 'ACTIVE' as const },
                { key: 'sage_connector', label: 'Conector Sage (.NET 8)', status: 'ACTIVE' as const },
                { key: 'payroll_import', label: 'Importação e normalização', status: 'PLANNED' as const },
                { key: 'payslips', label: 'Holerites e assinaturas', status: 'PLANNED' as const },
              ]).map((module) => (
                <article className="module-card" key={module.key}>
                  <div className={`module-icon ${module.status.toLowerCase()}`}>{module.status === 'ACTIVE' ? '✓' : '→'}</div>
                  <h4>{module.label}</h4>
                  <span>{module.status === 'ACTIVE' ? 'Ativo' : module.status === 'NEXT_STAGE' ? 'Próxima etapa' : 'Planejado'}</span>
                </article>
              ))}
            </div>
            <div className="rule-card">
              <strong>Regra funcional preservada</strong>
              <p>O holerite só será liberado para assinatura depois da solicitação feita pelo dashboard, quando passará ao status <b>“Assinatura solicitada”</b>.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
