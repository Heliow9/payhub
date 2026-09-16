export type UserRole = 'MASTER' | 'ANALISTA';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface PayHubUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardModule {
  key: string;
  label: string;
  status: 'ACTIVE' | 'NEXT_STAGE' | 'PLANNED';
}

export interface DashboardSummary {
  user: PayHubUser;
  platform: { name: string; stage: string; status: string };
  modules: DashboardModule[];
}

async function api<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Não foi possível concluir a operação.');
  }
  return payload as T;
}

export const client = {
  login(email: string, password: string) {
    return api<{ user: PayHubUser; csrfToken: string; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return api<{ user: PayHubUser; csrfToken: string }>('/api/auth/me');
  },
  logout(csrfToken: string) {
    return api<void>('/api/auth/logout', { method: 'POST' }, csrfToken);
  },
  dashboard() {
    return api<DashboardSummary>('/api/dashboard/summary');
  },
  users() {
    return api<{ users: PayHubUser[] }>('/api/users');
  },
  createAnalyst(input: { name: string; email: string; password: string }, csrfToken: string) {
    return api<{ user: PayHubUser }>('/api/users', { method: 'POST', body: JSON.stringify(input) }, csrfToken);
  },
};
