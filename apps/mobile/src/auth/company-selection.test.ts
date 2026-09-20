import { describe, expect, it } from 'vitest';
import { mobileCompanyAccessLabel, nextMobileAuthState, pendingMobileSelection } from './company-selection';

describe('seleção de empresa no aplicativo Android', () => {
  const companies = [
    { employeeId: 1, companyId: 1, companyName: 'RealEnergy', name: 'Maria', status: 'TERMINATED' as const, accessMode: 'HISTORICAL' as const },
    { employeeId: 2, companyId: 2, companyName: 'Empresa Nova', name: 'Maria', status: 'ACTIVE' as const, accessMode: 'FULL' as const },
  ];

  it('mantém o login pendente até escolher uma empresa', () => {
    const outcome = { requiresCompanySelection: true as const, selectionToken: 'selection-token', companies };
    expect(nextMobileAuthState(outcome)).toBe('SELECT_COMPANY');
    expect(pendingMobileSelection(outcome)).toEqual({ selectionToken: 'selection-token', companies });
  });

  it('identifica vínculo encerrado como acesso histórico', () => {
    expect(mobileCompanyAccessLabel(companies[0]!)).toMatch(/documentos anteriores/i);
  });
});
