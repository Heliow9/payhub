import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setCsrfToken, type Principal } from '../api/client';
import { reconcileSession } from './session-reconcile';

type AuthContextValue = {
  principal: Principal | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<void>;
  firstAccess(cpf: string, birthDate: string, pin: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);

  async function applyCurrentSession(): Promise<boolean> {
    try {
      const current = await api.me();
      setCsrfToken(current.csrfToken);
      setPrincipal(current.principal);
      return true;
    } catch {
      setCsrfToken('');
      return false;
    }
  }

  useEffect(() => {
    void applyCurrentSession()
      .then((restored) => { if (!restored) setPrincipal(null); })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    principal,
    loading,
    async login(identifier, password) {
      // Uma sessão HttpOnly válida é a fonte de verdade. Antes de autenticar
      // novamente, reconciliamos a sessão para evitar falso erro de credenciais.
      const result = await reconcileSession(
        () => api.me(),
        () => api.login(identifier, password)
      );
      setCsrfToken(result.csrfToken);
      setPrincipal(result.principal);
    },
    async firstAccess(cpf, birthDate, pin) {
      const result = await api.firstAccess(cpf, birthDate, pin);
      setCsrfToken(result.csrfToken);
      setPrincipal(result.principal);
    },
    async logout() {
      await api.logout().catch(() => undefined);
      setCsrfToken('');
      setPrincipal(null);
    }
  }), [principal, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente');
  return value;
}
