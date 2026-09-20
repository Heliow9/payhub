import { describe, expect, it } from 'vitest';
import { companyAccessLabel, pendingCompanySelection } from './company-selection';

describe('seleção de empresa', () => {
  it('mantém somente token temporário e empresas enquanto a sessão definitiva não existe', () => {
    const pending = pendingCompanySelection({
      requiresCompanySelection: true,
      selectionToken: 'selection-token',
      companies: [{ companyId: 1, companyName: 'RealEnergy', employeeId: 10, name: 'Maria', status: 'ACTIVE', accessMode: 'FULL' }],
    });
    expect(pending).toEqual({
      selectionToken: 'selection-token',
      companies: [expect.objectContaining({ companyId: 1, companyName: 'RealEnergy' })],
    });
  });

  it('identifica claramente vínculo histórico', () => {
    expect(companyAccessLabel({ companyId: 2, companyName: 'Empresa B', employeeId: 20, name: 'Maria', status: 'TERMINATED', accessMode: 'HISTORICAL' }))
      .toContain('histórico');
  });
});
