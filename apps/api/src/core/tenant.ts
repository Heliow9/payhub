import type { Request } from 'express';
import { HttpError, unauthorized } from './errors.js';
import type { EmployeePrincipal, Principal, RequestContext } from './types.js';

export function contextFromPrincipal(principal: Principal): RequestContext {
  return principal.kind === 'USER'
    ? { kind: 'USER', companyId: principal.companyId, userId: principal.id, role: principal.role }
    : {
        kind: 'EMPLOYEE',
        companyId: principal.companyId,
        employeeId: principal.id,
        identityId: principal.identityId,
        accessMode: principal.accessMode,
      };
}

export function requestContext(req: Request): RequestContext {
  if (!req.principal) throw unauthorized('Autenticação necessária.');
  return contextFromPrincipal(req.principal);
}

export function assertFullEmployeeAccess(principal: EmployeePrincipal): void {
  if (principal.accessMode !== 'FULL') {
    throw new HttpError(403, 'Este vínculo permite somente acesso histórico.', 'HISTORICAL_ACCESS_ONLY');
  }
}
