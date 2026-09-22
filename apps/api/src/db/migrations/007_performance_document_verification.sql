ALTER TABLE payrolls
  ADD COLUMN document_number VARCHAR(40) NULL AFTER id,
  ADD COLUMN render_hash CHAR(64) NULL AFTER source_hash,
  ADD UNIQUE KEY uk_payroll_document_number (document_number),
  ADD KEY idx_payroll_current_lookup (company_id, employee_id, year, month, payroll_type, is_current, version),
  ADD KEY idx_payroll_render_hash (render_hash);

UPDATE payrolls
SET document_number = CONCAT(
  'PH-',
  year,
  LPAD(month, 2, '0'),
  '-',
  SUBSTRING(UPPER(SHA2(CONCAT(UUID(), ':', id, ':', RAND()), 256)), 1, 16)
)
WHERE document_number IS NULL OR document_number = '';

UPDATE payrolls
SET render_hash = source_hash
WHERE render_hash IS NULL OR render_hash = '';

ALTER TABLE payrolls
  MODIFY document_number VARCHAR(40) NOT NULL,
  MODIFY render_hash CHAR(64) NOT NULL;


ALTER TABLE connector_raw_batches
  MODIFY payload_json LONGTEXT NULL,
  ADD COLUMN archived_path VARCHAR(500) NULL AFTER payload_json,
  ADD COLUMN archived_sha256 CHAR(64) NULL AFTER archived_path,
  ADD COLUMN archived_bytes BIGINT UNSIGNED NULL AFTER archived_sha256,
  ADD COLUMN archived_at DATETIME NULL AFTER archived_bytes,
  ADD KEY idx_connector_raw_archived (company_id, archived_at);

CREATE TABLE IF NOT EXISTS document_verification_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_id BIGINT UNSIGNED NOT NULL,
  document_number VARCHAR(40) NOT NULL,
  verification_type ENUM('LOOKUP','FILE_HASH') NOT NULL DEFAULT 'LOOKUP',
  supplied_file_sha256 CHAR(64) NULL,
  result_code VARCHAR(60) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_document_verification_payroll (payroll_id, created_at),
  KEY idx_document_verification_number (document_number, created_at),
  CONSTRAINT fk_document_verification_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
