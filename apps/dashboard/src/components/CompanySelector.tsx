import type { CompanyOption } from '../api/client';
import { companyAccessLabel } from '../auth/company-selection';

export function CompanySelector({
  companies,
  currentCompanyId,
  busyCompanyId,
  title = 'Escolha a empresa',
  subtitle = 'Seu CPF possui vínculo com mais de uma empresa. Selecione onde deseja entrar.',
  onSelect,
  onCancel,
}: {
  companies: CompanyOption[];
  currentCompanyId?: number;
  busyCompanyId?: number | null;
  title?: string;
  subtitle?: string;
  onSelect(companyId: number): void | Promise<void>;
  onCancel?(): void;
}) {
  return <div className="company-selector">
    <div className="company-selector-heading">
      <span className="eyebrow">ACESSO MULTIEMPRESA</span>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    <div className="company-selector-list">
      {companies.map((company) => {
        const historical = company.accessMode === 'HISTORICAL' || company.status === 'TERMINATED';
        const current = company.companyId === currentCompanyId;
        return <button
          type="button"
          key={`${company.companyId}-${company.employeeId}`}
          className={`company-option ${historical ? 'historical' : ''} ${current ? 'current' : ''}`}
          disabled={Boolean(busyCompanyId) || current}
          onClick={() => void onSelect(company.companyId)}
        >
          <span className="company-option-icon">{historical ? '◷' : '✓'}</span>
          <span className="company-option-copy">
            <strong>{company.companyName}</strong>
            <small>{companyAccessLabel(company)}</small>
          </span>
          <span className="company-option-action">
            {current ? 'Atual' : busyCompanyId === company.companyId ? 'Entrando…' : 'Acessar →'}
          </span>
        </button>;
      })}
    </div>
    {onCancel && <button type="button" className="link-button company-selector-cancel" onClick={onCancel}>Cancelar</button>}
  </div>;
}
