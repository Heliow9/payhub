ALTER TABLE import_jobs
  ADD COLUMN normalization_state ENUM('PENDING','CLAIMED','COMPLETED','FAILED') NULL AFTER normalized_at,
  ADD COLUMN normalization_owner VARCHAR(100) NULL AFTER normalization_state,
  ADD COLUMN normalization_claimed_at DATETIME NULL AFTER normalization_owner,
  ADD COLUMN normalization_lease_until DATETIME NULL AFTER normalization_claimed_at,
  ADD COLUMN normalization_attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER normalization_lease_until,
  ADD COLUMN normalization_error VARCHAR(1000) NULL AFTER normalization_attempt_count,
  ADD KEY idx_import_jobs_normalization (job_type,status,normalization_state,normalization_lease_until,id);

UPDATE import_jobs
   SET normalization_state='COMPLETED'
 WHERE job_type='PAYROLL_IMPORT' AND normalized_at IS NOT NULL;

UPDATE import_jobs
   SET normalization_state='PENDING'
 WHERE job_type='PAYROLL_IMPORT' AND status='COMPLETED' AND normalized_at IS NULL;

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_name VARCHAR(80) NOT NULL,
  instance_id VARCHAR(100) NOT NULL,
  status ENUM('STARTING','RUNNING','STOPPING','ERROR') NOT NULL,
  phase ENUM('IDLE','CLAIMING','NORMALIZING','SCHEDULING','NOTIFYING') NOT NULL,
  current_job_id BIGINT UNSIGNED NULL,
  last_cycle_started_at DATETIME NULL,
  last_cycle_finished_at DATETIME NULL,
  last_heartbeat_at DATETIME NOT NULL,
  last_error VARCHAR(1000) NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (worker_name),
  KEY idx_worker_heartbeat_time (last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  notification_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','CLAIMED','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  owner VARCHAR(100) NULL,
  lease_until DATETIME NULL,
  next_attempt_at DATETIME NOT NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notification_outbox_notification (notification_id),
  KEY idx_notification_outbox_claim (status,next_attempt_at,lease_until,id),
  KEY idx_notification_outbox_company (company_id,status,id),
  CONSTRAINT fk_notification_outbox_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_notification_outbox_notification FOREIGN KEY (notification_id) REFERENCES notifications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
