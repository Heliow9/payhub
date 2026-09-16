import { useAuth } from './auth/AuthProvider';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const auth = useAuth();
  if (auth.loading) return <div className="splash"><div className="brand-mark">PH</div><strong>PayHub</strong><span>Carregando ambiente seguro…</span></div>;
  if (!auth.user || !auth.csrfToken) return <LoginPage onLogin={auth.login} />;
  return <DashboardPage user={auth.user} csrfToken={auth.csrfToken} onLogout={auth.logout} />;
}
