export type UserRole = 'MASTER' | 'ANALISTA';
export type UserPrincipal = {
  kind: 'USER';
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
  csrfToken?: string;
};
export type EmployeePrincipal = {
  kind: 'EMPLOYEE';
  id: number;
  identityId: number;
  companyId: number;
  companyName: string;
  name: string;
  cpf: string;
  status: 'ACTIVE' | 'DISABLED' | 'TERMINATED';
  accessMode: 'FULL' | 'HISTORICAL';
  csrfToken?: string;
};
export type Principal = UserPrincipal | EmployeePrincipal;

export type UserContext = { kind: 'USER'; companyId: number; userId: number; role: UserRole };
export type EmployeeContext = {
  kind: 'EMPLOYEE';
  companyId: number;
  employeeId: number;
  identityId: number;
  accessMode: 'FULL' | 'HISTORICAL';
};
export type RequestContext = UserContext | EmployeeContext;

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export type PayrollStatus = 'PROCESSING' | 'READY' | 'SIGNATURE_REQUESTED' | 'VIEWED' | 'SIGNED' | 'ERROR' | 'CANCELLED' | 'REPLACED';
export type SignatureMode = 'ACCEPT' | 'ACCEPT_AND_DRAW';
