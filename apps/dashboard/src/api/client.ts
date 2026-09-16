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


export type ConnectorStatus = 'PENDING' | 'ONLINE' | 'OFFLINE' | 'DISABLED';
export interface Connector {
  id: number;
  name: string;
  machineName: string | null;
  status: ConnectorStatus;
  lastSeenAt: string | null;
  lastIpAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}

export type ImportJobType = 'CONNECTION_TEST' | 'SCHEMA_DISCOVERY' | 'PAYROLL_IMPORT';
export type ImportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface ImportJobLog {
  id: number;
  jobId: number;
  connectorId: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ImportJob {
  id: number;
  requestedByUserId: number;
  connectorId: number | null;
  jobType: ImportJobType;
  status: ImportJobStatus;
  scope: Record<string, unknown> | null;
  progressCurrent: number;
  progressTotal: number;
  progressMessage: string | null;
  attemptCount: number;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
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
  connectors() {
    return api<{ connectors: Connector[] }>('/api/connectors');
  },
  createConnector(name: string, csrfToken: string) {
    return api<{ connector: Connector; token: string }>('/api/connectors', { method: 'POST', body: JSON.stringify({ name }) }, csrfToken);
  },
  importJobs() {
    return api<{ jobs: ImportJob[] }>('/api/import-jobs');
  },
  importJobLogs(jobId: number) {
    return api<{ logs: ImportJobLog[] }>(`/api/import-jobs/${jobId}/logs`);
  },
  createImportJob(input: { jobType: ImportJobType; scope?: Record<string, unknown> }, csrfToken: string) {
    return api<{ job: ImportJob }>('/api/import-jobs', { method: 'POST', body: JSON.stringify(input) }, csrfToken);
  },
};
