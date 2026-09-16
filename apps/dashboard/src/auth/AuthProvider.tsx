import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { client, type PayHubUser } from '../api/client';

interface AuthContextValue {
  user: PayHubUser | null;
  csrfToken: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PayHubUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    client.me()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setCsrfToken(session.csrfToken);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setCsrfToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    csrfToken,
    loading,
    async login(email, password) {
      const session = await client.login(email, password);
      setUser(session.user);
      setCsrfToken(session.csrfToken);
    },
    async logout() {
      try {
        if (csrfToken) await client.logout(csrfToken);
      } finally {
        setUser(null);
        setCsrfToken(null);
      }
    },
  }), [user, csrfToken, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
