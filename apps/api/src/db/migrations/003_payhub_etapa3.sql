CREATE TABLE IF NOT EXISTS employee_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  company_code VARCHAR(20) NOT NULL DEFAULT '1',
  payroll_types_json LONGTEXT NOT NULL,
  auto_search_enabled TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_groups_name (name),
  CONSTRAINT fk_employee_groups_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  run_time TIME NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_group_schedules_time (group_id, run_time),
  KEY idx_group_schedules_group (group_id),
  CONSTRAINT fk_group_schedules_group FOREIGN KEY (group_id) REFERENCES employee_groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_code VARCHAR(20) NOT NULL DEFAULT '1',
  sage_employee_code VARCHAR(100) NOT NULL,
  cpf CHAR(11) NOT NULL,
  name VARCHAR(190) NOT NULL,
  birth_date DATE NOT NULL,
  admission_date DATE NULL,
  job_title VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  sage_status VARCHAR(80) NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','DISABLED','TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  sage_snapshot_json LONGTEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employees_cpf (cpf),
  UNIQUE KEY uk_employees_sage (company_code, sage_employee_code),
  KEY idx_employees_group (group_id),
  KEY idx_employees_status (status),
  CONSTRAINT fk_employees_group FOREIGN KEY (group_id) REFERENCES employee_groups(id),
  CONSTRAINT fk_employees_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_credentials (
  employee_id BIGINT UNSIGNED NOT NULL,
  pin_hash VARCHAR(255) NULL,
  activated_at DATETIME NULL,
  pin_changed_at DATETIME NULL,
  failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_credentials_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_sessions_token (token_hash),
  KEY idx_employee_sessions_employee (employee_id),
  KEY idx_employee_sessions_expires (expires_at),
  CONSTRAINT fk_employee_sessions_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_membership_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  from_group_id BIGINT UNSIGNED NULL,
  to_group_id BIGINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  changed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_group_membership_employee (employee_id, changed_at),
  CONSTRAINT fk_gmh_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_gmh_from_group FOREIGN KEY (from_group_id) REFERENCES employee_groups(id),
  CONSTRAINT fk_gmh_to_group FOREIGN KEY (to_group_id) REFERENCES employee_groups(id),
  CONSTRAINT fk_gmh_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NULL,
  requested_by_user_id BIGINT UNSIGNED NULL,
  source ENUM('MANUAL','SCHEDULED','INDIVIDUAL') NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  payroll_types_json LONGTEXT NOT NULL,
  employee_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED') NOT NULL DEFAULT 'QUEUED',
  success_count INT UNSIGNED NOT NULL DEFAULT 0,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_payroll_runs_group (group_id, created_at),
  KEY idx_payroll_runs_status (status, created_at),
  CONSTRAINT fk_payroll_runs_group FOREIGN KEY (group_id) REFERENCES employee_groups(id),
  CONSTRAINT fk_payroll_runs_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schedule_executions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  run_date DATE NOT NULL,
  run_time TIME NOT NULL,
  payroll_run_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_schedule_execution (schedule_id, run_date),
  CONSTRAINT fk_schedule_execution_schedule FOREIGN KEY (schedule_id) REFERENCES group_schedules(id),
  CONSTRAINT fk_schedule_execution_group FOREIGN KEY (group_id) REFERENCES employee_groups(id),
  CONSTRAINT fk_schedule_execution_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payrolls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  payroll_run_id BIGINT UNSIGNED NULL,
  company_code VARCHAR(20) NOT NULL DEFAULT '1',
  sage_employee_code VARCHAR(100) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  payroll_type INT NOT NULL,
  payroll_type_label VARCHAR(80) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('PROCESSING','READY','SIGNATURE_REQUESTED','VIEWED','SIGNED','ERROR','CANCELLED','REPLACED') NOT NULL DEFAULT 'PROCESSING',
  gross_amount DECIMAL(15,2) NULL,
  deduction_amount DECIMAL(15,2) NULL,
  net_amount DECIMAL(15,2) NULL,
  source_hash CHAR(64) NOT NULL,
  summary_json LONGTEXT NOT NULL,
  raw_reference_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  released_at DATETIME NULL,
  signed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_payroll_version (employee_id, year, month, payroll_type, version),
  KEY idx_payroll_current (employee_id, is_current, year, month),
  KEY idx_payroll_status (status, year, month),
  KEY idx_payroll_source_hash (source_hash),
  CONSTRAINT fk_payroll_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_payroll_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_id BIGINT UNSIGNED NOT NULL,
  event_code VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  reference_value VARCHAR(100) NULL,
  amount DECIMAL(15,2) NOT NULL,
  nature ENUM('EARNING','DEDUCTION','BASE','OTHER') NOT NULL DEFAULT 'OTHER',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_payroll_items_payroll (payroll_id, sort_order),
  CONSTRAINT fk_payroll_items_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_documents (
  payroll_id BIGINT UNSIGNED NOT NULL,
  original_path VARCHAR(500) NOT NULL,
  original_sha256 CHAR(64) NOT NULL,
  signed_path VARCHAR(500) NULL,
  signed_sha256 CHAR(64) NULL,
  receipt_path VARCHAR(500) NULL,
  receipt_sha256 CHAR(64) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (payroll_id),
  CONSTRAINT fk_payroll_documents_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signature_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','SIGNED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  acceptance_text LONGTEXT NOT NULL,
  acceptance_text_hash CHAR(64) NOT NULL,
  requested_at DATETIME NOT NULL,
  signed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_signature_request_payroll (payroll_id),
  KEY idx_signature_request_employee (employee_id, status),
  CONSTRAINT fk_signature_request_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id),
  CONSTRAINT fk_signature_request_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_signature_request_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signature_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signature_request_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_signature_links_token (token_hash),
  KEY idx_signature_links_request (signature_request_id),
  KEY idx_signature_links_expires (expires_at),
  CONSTRAINT fk_signature_link_request FOREIGN KEY (signature_request_id) REFERENCES signature_requests(id),
  CONSTRAINT fk_signature_link_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signature_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signature_request_id BIGINT UNSIGNED NOT NULL,
  payroll_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  auth_method ENUM('PIN_VERIFIED','FIRST_ACCESS_VERIFIED') NOT NULL,
  origin ENUM('PORTAL','PWA','ANDROID','TEMPORARY_LINK') NOT NULL,
  original_pdf_sha256 CHAR(64) NOT NULL,
  signed_pdf_sha256 CHAR(64) NOT NULL,
  acceptance_text_hash CHAR(64) NOT NULL,
  evidence_json LONGTEXT NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  seal_hmac_sha256 CHAR(64) NOT NULL,
  tsa_response LONGTEXT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  session_reference VARCHAR(190) NULL,
  drawing_path VARCHAR(500) NULL,
  drawing_sha256 CHAR(64) NULL,
  signed_at_utc DATETIME NOT NULL,
  signed_at_brt VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_signature_evidence_request (signature_request_id),
  CONSTRAINT fk_signature_evidence_request FOREIGN KEY (signature_request_id) REFERENCES signature_requests(id),
  CONSTRAINT fk_signature_evidence_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id),
  CONSTRAINT fk_signature_evidence_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signature_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signature_request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_json LONGTEXT NOT NULL,
  previous_hash CHAR(64) NULL,
  event_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_signature_events_request (signature_request_id, id),
  CONSTRAINT fk_signature_events_request FOREIGN KEY (signature_request_id) REFERENCES signature_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_access_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_id BIGINT UNSIGNED NOT NULL,
  actor_type ENUM('USER','EMPLOYEE','PUBLIC_LINK') NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action ENUM('VIEW_SUMMARY','VIEW_FULL','DOWNLOAD','SIGN') NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_document_access_payroll (payroll_id, created_at),
  CONSTRAINT fk_document_access_payroll FOREIGN KEY (payroll_id) REFERENCES payrolls(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL,
  signature_mode ENUM('ACCEPT','ACCEPT_AND_DRAW') NOT NULL DEFAULT 'ACCEPT_AND_DRAW',
  signature_link_ttl_minutes INT UNSIGNED NOT NULL DEFAULT 1440,
  acceptance_text LONGTEXT NOT NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_app_settings_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (id, signature_mode, signature_link_ttl_minutes, acceptance_text, updated_by_user_id, updated_at)
SELECT 1, 'ACCEPT_AND_DRAW', 1440,
'Declaro que visualizei o holerite referente à competência informada, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento deste documento.',
NULL, UTC_TIMESTAMP()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1);

ALTER TABLE import_jobs
  MODIFY requested_by_user_id BIGINT UNSIGNED NULL,
  MODIFY job_type ENUM('CONNECTION_TEST','SCHEMA_DISCOVERY','PAYROLL_IMPORT','EMPLOYEE_LOOKUP_BY_CPF') NOT NULL,
  ADD COLUMN payroll_run_id BIGINT UNSIGNED NULL AFTER connector_id,
  ADD COLUMN normalized_at DATETIME NULL AFTER finished_at,
  ADD KEY idx_import_jobs_payroll_run (payroll_run_id),
  ADD CONSTRAINT fk_import_jobs_payroll_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id);
