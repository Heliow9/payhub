CREATE TABLE IF NOT EXISTS connectors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  machine_name VARCHAR(190) NULL,
  status ENUM('PENDING','ONLINE','OFFLINE','DISABLED') NOT NULL DEFAULT 'PENDING',
  last_seen_at DATETIME NULL,
  last_ip_address VARCHAR(64) NULL,
  metadata_json LONGTEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_connectors_token_hash (token_hash),
  KEY idx_connectors_status (status),
  KEY idx_connectors_last_seen (last_seen_at),
  CONSTRAINT fk_connectors_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  connector_id BIGINT UNSIGNED NULL,
  job_type ENUM('CONNECTION_TEST','SCHEMA_DISCOVERY','PAYROLL_IMPORT') NOT NULL,
  status ENUM('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  scope_json LONGTEXT NULL,
  progress_current INT UNSIGNED NOT NULL DEFAULT 0,
  progress_total INT UNSIGNED NOT NULL DEFAULT 0,
  progress_message VARCHAR(500) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  claimed_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  error_message VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_import_jobs_status_created (status, created_at),
  KEY idx_import_jobs_connector (connector_id),
  KEY idx_import_jobs_requested_by (requested_by_user_id),
  CONSTRAINT fk_import_jobs_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_import_jobs_connector FOREIGN KEY (connector_id) REFERENCES connectors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS connector_job_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id BIGINT UNSIGNED NOT NULL,
  connector_id BIGINT UNSIGNED NOT NULL,
  level ENUM('INFO','WARN','ERROR') NOT NULL DEFAULT 'INFO',
  message VARCHAR(1000) NOT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_connector_job_logs_job (job_id, id),
  KEY idx_connector_job_logs_connector (connector_id),
  CONSTRAINT fk_connector_job_logs_job FOREIGN KEY (job_id) REFERENCES import_jobs(id),
  CONSTRAINT fk_connector_job_logs_connector FOREIGN KEY (connector_id) REFERENCES connectors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS connector_raw_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id BIGINT UNSIGNED NOT NULL,
  connector_id BIGINT UNSIGNED NOT NULL,
  source_table VARCHAR(80) NOT NULL,
  batch_number INT UNSIGNED NOT NULL,
  row_count INT UNSIGNED NOT NULL,
  source_hash CHAR(64) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_connector_raw_batch (job_id, source_table, batch_number),
  KEY idx_connector_raw_batches_job (job_id),
  KEY idx_connector_raw_batches_source_hash (source_hash),
  CONSTRAINT fk_connector_raw_batches_job FOREIGN KEY (job_id) REFERENCES import_jobs(id),
  CONSTRAINT fk_connector_raw_batches_connector FOREIGN KEY (connector_id) REFERENCES connectors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
