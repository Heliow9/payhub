export type UserRole = 'MASTER' | 'ANALISTA';
export type Principal =
  | { kind: 'USER'; id: number; name: string; email: string; role: UserRole; status: 'ACTIVE' | 'DISABLED'; csrfToken?: string }
  | { kind: 'EMPLOYEE'; id: number; name: string; cpf: string; status: 'ACTIVE' | 'DISABLED' | 'TERMINATED'; csrfToken?: string };

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export type PayrollStatus = 'PROCESSING' | 'READY' | 'SIGNATURE_REQUESTED' | 'VIEWED' | 'SIGNED' | 'ERROR' | 'CANCELLED' | 'REPLACED';
export type SignatureMode = 'ACCEPT' | 'ACCEPT_AND_DRAW';
