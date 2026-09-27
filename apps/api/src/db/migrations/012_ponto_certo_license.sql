CREATE TABLE IF NOT EXISTS company_licenses (
  company_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  external_source VARCHAR(40) NOT NULL DEFAULT 'PONTO_CERTO',
  external_subscription_id VARCHAR(190) NULL,
  plan_code VARCHAR(80) NULL,
  max_employees INT NULL,
  document_retention_days INT NULL,
  financial_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  blocked_at DATETIME NULL,
  block_reason VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_company_licenses_status(financial_status),
  CONSTRAINT fk_company_licenses_company FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
