import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, type AuthOutcome, type CompanyOption, type Principal } from '../api/client';
import { isCompanySelectionOutcome, type PendingCompanySelection } from './company-selection';

type AuthContextValue = {
  principal: Principal | null;
  loading: boolean;
  pendingSelection: PendingCompanySelection | null;
  availableCompanies: CompanyOption[];
  sessionVersion: number;
  login(identifier: string, password: string): Promise<void>;
  firstAccess(cpf: string, birthDate: string, pin: string): Promise<void>;
  selectCompany(companyId: number): Promise<void>;
  switchCompany(companyId: number): Promise<void>;
  cancelCompanySelection(): void;
  logout(): Promise<void>;
  refresh(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSelection, setPendingSelection] = useState<PendingCompanySelection | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<CompanyOption[]>([]);
  const [sessionVersion, setSessionVersion] = useState(0);

  async function loadCompanyOptions(nextPrincipal: Principal | null) {
    if (!nextPrincipal || nextPrincipal.kind !== 'EMPLOYEE') {
      setAvailableCompanies([]);
      return;
    }
    try {
      const result = await api.companyOptions();
      setAvailableCompanies(result.companies ?? []);
    } catch {
      setAvailableCompanies([{
        companyId: nextPrincipal.companyId,
        companyName: nextPrincipal.companyName,
        employeeId: nextPrincipal.id,
        name: nextPrincipal.name,
        status: nextPrincipal.status === 'TERMINATED' ? 'TERMINATED' : 'ACTIVE',
        accessMode: nextPrincipal.accessMode,
      }]);
    }
  }

  async function applyAuthenticatedSession(result: { principal: Principal; csrfToken: string }) {
    setCsrfToken(result.csrfToken);
    setPrincipal(result.principal);
    setPendingSelection(null);
    await loadCompanyOptions(result.principal);
    setSessionVersion((value) => value + 1);
  }

  async function applyOutcome(result: AuthOutcome) {
    if (isCompanySelectionOutcome(result)) {
      setCsrfToken('');
      setPrincipal(null);
      setPendingSelection({ selectionToken: result.selectionToken, companies: result.companies });
      setAvailableCompanies(result.companies);
      return;
    }
    await applyAuthenticatedSession(result);
  }

  async function applyCurrentSession(): Promise<boolean> {
    try {
      const current = await api.me();
      setCsrfToken(current.csrfToken);
      setPrincipal(current.principal);
      setPendingSelection(null);
      await loadCompanyOptions(current.principal);
      return Boolean(current.principal);
    } catch {
      setCsrfToken('');
      setPrincipal(null);
      setPendingSelection(null);
      setAvailableCompanies([]);
      return false;
    }
  }

  useEffect(() => {
    void applyCurrentSession().finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    principal,
    loading,
    pendingSelection,
    availableCompanies,
    sessionVersion,
    async login(identifier, password) {
      await applyOutcome(await api.login(identifier, password));
    },
    async firstAccess(cpf, birthDate, pin) {
      await applyOutcome(await api.firstAccess(cpf, birthDate, pin));
    },
    async selectCompany(companyId) {
      if (!pendingSelection) throw new Error('Seleção de empresa não está ativa.');
      try {
        const result = await api.selectCompany(pendingSelection.selectionToken, companyId);
        await applyAuthenticatedSession(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setPendingSelection(null);setAvailableCompanies([]);setCsrfToken('');
        }
        throw error;
      }
    },
    async switchCompany(companyId) {
      if (!principal || principal.kind !== 'EMPLOYEE') throw new Error('Troca de empresa disponível somente para funcionário.');
      if (principal.companyId === companyId) return;
      const result = await api.switchCompany(companyId);
      setCsrfToken(result.csrfToken);
      setPrincipal(result.principal);
      setPendingSelection(null);
      // Revalida a sessão recém-emitida e renova o CSRF no novo tenant.
      await applyCurrentSession();
      setSessionVersion((current) => current + 1);
    },
    cancelCompanySelection() {
      setPendingSelection(null);
      setAvailableCompanies([]);
      setCsrfToken('');
    },
    async logout() {
      await api.logout().catch(() => undefined);
      setCsrfToken('');
      setPrincipal(null);
      setPendingSelection(null);
      setAvailableCompanies([]);
      setSessionVersion((value) => value + 1);
    },
    async refresh() {
      await applyCurrentSession();
      setSessionVersion((value) => value + 1);
    },
  }), [principal, loading, pendingSelection, availableCompanies, sessionVersion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente');
  return value;
}
