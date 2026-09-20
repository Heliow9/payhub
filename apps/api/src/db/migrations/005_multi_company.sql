CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_name VARCHAR(190) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  sage_company_code VARCHAR(20) NOT NULL,
  external_source VARCHAR(40) NULL,
  external_id VARCHAR(190) NULL,
  provisioning_key VARCHAR(190) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_companies_slug (slug),
  UNIQUE KEY uk_companies_external (external_source, external_id),
  UNIQUE KEY uk_companies_provisioning_key (provisioning_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO companies
  (legal_name, display_name, slug, status, sage_company_code, created_at, updated_at)
SELECT 'RealEnergy', 'RealEnergy', 'realenergy', 'ACTIVE', '1', UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'realenergy');

SET @realenergy_company_id := (SELECT id FROM companies WHERE slug = 'realenergy' LIMIT 1);

ALTER TABLE users ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE users SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE users
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_users_company_status (company_id, status),
  ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id);

CREATE TABLE IF NOT EXISTS company_masters (
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (company_id),
  UNIQUE KEY uk_company_masters_user (user_id),
  CONSTRAINT fk_company_masters_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_masters_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO company_masters (company_id, user_id, created_at, updated_at)
SELECT @realenergy_company_id, id, UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM users
WHERE email = 'admin@realenergy.com.br' AND role = 'MASTER' AND company_id = @realenergy_company_id
LIMIT 1;

INSERT IGNORE INTO company_masters (company_id, user_id, created_at, updated_at)
SELECT @realenergy_company_id, MIN(id), UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM users
WHERE role = 'MASTER' AND company_id = @realenergy_company_id
HAVING MIN(id) IS NOT NULL;

ALTER TABLE sessions ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER user_id;
UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.company_id = u.company_id WHERE s.company_id IS NULL;
ALTER TABLE sessions
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_sessions_company_user (company_id, user_id),
  ADD CONSTRAINT fk_sessions_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE audit_logs ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE audit_logs SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE audit_logs
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_audit_company_created (company_id, created_at),
  ADD CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE connectors ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE connectors SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE connectors
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_connectors_company_status (company_id, status),
  ADD CONSTRAINT fk_connectors_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE import_jobs ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE import_jobs SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE import_jobs
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_import_jobs_company_status (company_id, status, created_at),
  ADD CONSTRAINT fk_import_jobs_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE connector_job_logs ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE connector_job_logs l JOIN import_jobs j ON j.id = l.job_id SET l.company_id = j.company_id WHERE l.company_id IS NULL;
ALTER TABLE connector_job_logs
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_connector_job_logs_company_job (company_id, job_id, id),
  ADD CONSTRAINT fk_connector_job_logs_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE connector_raw_batches ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE connector_raw_batches b JOIN import_jobs j ON j.id = b.job_id SET b.company_id = j.company_id WHERE b.company_id IS NULL;
ALTER TABLE connector_raw_batches
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_connector_raw_company_job (company_id, job_id),
  ADD CONSTRAINT fk_connector_raw_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE employee_groups ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE employee_groups SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE employee_groups
  DROP INDEX uk_employee_groups_name,
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_employee_groups_company_name (company_id, name),
  ADD KEY idx_employee_groups_company_status (company_id, status),
  ADD CONSTRAINT fk_employee_groups_company FOREIGN KEY (company_id) REFERENCES companies(id);

CREATE TABLE IF NOT EXISTS employee_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cpf CHAR(11) NOT NULL,
  birth_date DATE NOT NULL,
  pin_hash VARCHAR(255) NULL,
  activated_at DATETIME NULL,
  pin_changed_at DATETIME NULL,
  failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_identities_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO employee_identities
  (cpf, birth_date, pin_hash, activated_at, pin_changed_at, failed_attempts, locked_until, last_login_at, created_at, updated_at)
SELECT e.cpf, e.birth_date, c.pin_hash, c.activated_at, c.pin_changed_at,
       COALESCE(c.failed_attempts, 0), c.locked_until, c.last_login_at, e.created_at, e.updated_at
FROM employees e
LEFT JOIN employee_credentials c ON c.employee_id = e.id
ON DUPLICATE KEY UPDATE cpf = VALUES(cpf);

ALTER TABLE employees
  ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id,
  ADD COLUMN identity_id BIGINT UNSIGNED NULL AFTER company_id;
UPDATE employees e JOIN employee_identities i ON i.cpf = e.cpf
SET e.company_id = @realenergy_company_id, e.identity_id = i.id
WHERE e.company_id IS NULL OR e.identity_id IS NULL;
ALTER TABLE employees
  DROP INDEX uk_employees_cpf,
  DROP INDEX uk_employees_sage,
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  MODIFY identity_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_employees_company_identity (company_id, identity_id),
  ADD UNIQUE KEY uk_employees_company_cpf (company_id, cpf),
  ADD UNIQUE KEY uk_employees_company_sage (company_id, sage_employee_code),
  ADD KEY idx_employees_company_status (company_id, status),
  ADD CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES companies(id),
  ADD CONSTRAINT fk_employees_identity FOREIGN KEY (identity_id) REFERENCES employee_identities(id);

ALTER TABLE employee_sessions
  ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER employee_id,
  ADD COLUMN identity_id BIGINT UNSIGNED NULL AFTER company_id;
UPDATE employee_sessions s JOIN employees e ON e.id = s.employee_id
SET s.company_id = e.company_id, s.identity_id = e.identity_id
WHERE s.company_id IS NULL OR s.identity_id IS NULL;
ALTER TABLE employee_sessions
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  MODIFY identity_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_employee_sessions_company_identity (company_id, identity_id),
  ADD CONSTRAINT fk_employee_sessions_company FOREIGN KEY (company_id) REFERENCES companies(id),
  ADD CONSTRAINT fk_employee_sessions_identity FOREIGN KEY (identity_id) REFERENCES employee_identities(id);

CREATE TABLE IF NOT EXISTS employee_company_selections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  client ENUM('WEB','MOBILE') NOT NULL DEFAULT 'WEB',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_company_selections_token (token_hash),
  KEY idx_employee_company_selections_identity (identity_id, expires_at),
  CONSTRAINT fk_employee_company_selections_identity FOREIGN KEY (identity_id) REFERENCES employee_identities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE payroll_runs ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE payroll_runs SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE payroll_runs
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_payroll_runs_company_status (company_id, status, created_at),
  ADD CONSTRAINT fk_payroll_runs_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE schedule_executions ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE schedule_executions x JOIN employee_groups g ON g.id = x.group_id SET x.company_id = g.company_id WHERE x.company_id IS NULL;
ALTER TABLE schedule_executions
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_schedule_executions_company_date (company_id, run_date),
  ADD CONSTRAINT fk_schedule_executions_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE payrolls ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE payrolls p JOIN employees e ON e.id = p.employee_id SET p.company_id = e.company_id WHERE p.company_id IS NULL;
ALTER TABLE payrolls
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_payrolls_company_status (company_id, status, year, month),
  ADD CONSTRAINT fk_payrolls_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE app_settings
  MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE app_settings SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE app_settings
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_app_settings_company (company_id),
  ADD CONSTRAINT fk_app_settings_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE push_subscriptions ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE push_subscriptions SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE push_subscriptions
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_push_subscriptions_company_principal (company_id, principal_type, principal_id),
  ADD CONSTRAINT fk_push_subscriptions_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE push_preferences ADD COLUMN company_id BIGINT UNSIGNED NULL FIRST;
UPDATE push_preferences SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE push_preferences
  DROP PRIMARY KEY,
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD PRIMARY KEY (company_id, principal_type, principal_id, category),
  ADD CONSTRAINT fk_push_preferences_company FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE notifications ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id;
UPDATE notifications SET company_id = @realenergy_company_id WHERE company_id IS NULL;
ALTER TABLE notifications
  DROP INDEX uk_notifications_dedup,
  MODIFY company_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uk_notifications_company_dedup (company_id, dedup_key),
  ADD KEY idx_notifications_company_recipient (company_id, recipient_type, recipient_id, created_at),
  ADD CONSTRAINT fk_notifications_company FOREIGN KEY (company_id) REFERENCES companies(id);
