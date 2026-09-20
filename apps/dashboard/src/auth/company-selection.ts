import type { AuthOutcome, CompanyOption } from '../api/client';

export type PendingCompanySelection = {
  selectionToken: string;
  companies: CompanyOption[];
};

export function isCompanySelectionOutcome(outcome: AuthOutcome): outcome is Extract<AuthOutcome, { requiresCompanySelection: true }> {
  return 'requiresCompanySelection' in outcome && outcome.requiresCompanySelection === true;
}

export function pendingCompanySelection(outcome: AuthOutcome): PendingCompanySelection | null {
  return isCompanySelectionOutcome(outcome)
    ? { selectionToken: outcome.selectionToken, companies: outcome.companies }
    : null;
}

export function companyAccessLabel(company: CompanyOption): string {
  return company.accessMode === 'HISTORICAL' || company.status === 'TERMINATED'
    ? 'Vínculo encerrado · acesso histórico'
    : 'Vínculo ativo';
}
