ALTER TABLE group_schedules
  ADD COLUMN weekdays_mask TINYINT UNSIGNED NOT NULL DEFAULT 31 AFTER run_time,
  ADD KEY idx_group_schedules_due (enabled, run_time, weekdays_mask, group_id);

ALTER TABLE schedule_executions
  ADD COLUMN status ENUM('PENDING','CLAIMED','ENQUEUED','FAILED') NOT NULL DEFAULT 'PENDING' AFTER payroll_run_id,
  ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN claim_owner VARCHAR(100) NULL AFTER attempt_count,
  ADD COLUMN claimed_at DATETIME NULL AFTER claim_owner,
  ADD COLUMN claim_lease_until DATETIME NULL AFTER claimed_at,
  ADD COLUMN error_message VARCHAR(1000) NULL AFTER claim_lease_until,
  ADD COLUMN updated_at DATETIME NULL AFTER created_at,
  ADD KEY idx_schedule_execution_state (company_id, run_date, status, claim_lease_until),
  ADD KEY idx_schedule_execution_group_date (company_id, group_id, run_date);

UPDATE schedule_executions
   SET status = IF(payroll_run_id IS NULL, 'PENDING', 'ENQUEUED'),
       updated_at = COALESCE(updated_at, created_at)
 WHERE updated_at IS NULL;

ALTER TABLE payroll_runs
  ADD COLUMN schedule_execution_id BIGINT UNSIGNED NULL AFTER group_id,
  ADD UNIQUE KEY uk_payroll_runs_schedule_execution (schedule_execution_id);

UPDATE payroll_runs r
JOIN schedule_executions x ON x.payroll_run_id = r.id
   SET r.schedule_execution_id = x.id
 WHERE r.schedule_execution_id IS NULL;

CREATE TABLE IF NOT EXISTS payroll_run_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  payroll_run_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  stage VARCHAR(50) NOT NULL,
  level ENUM('INFO','WARN','ERROR') NOT NULL DEFAULT 'INFO',
  message VARCHAR(1000) NOT NULL,
  metadata_json LONGTEXT NULL,
  dedup_key VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payroll_run_events_run (company_id, payroll_run_id, id),
  KEY idx_payroll_run_events_created (company_id, created_at),
  UNIQUE KEY uk_payroll_run_event_dedup (payroll_run_id, dedup_key),
  CONSTRAINT fk_payroll_run_events_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_payroll_run_events_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO payroll_run_events
  (company_id,payroll_run_id,event_type,stage,level,message,metadata_json,dedup_key,created_at)
SELECT r.company_id,r.id,'RUN_IMPORTED','HISTORY','INFO',
       CONCAT('Execução histórica importada com status ',r.status,'.'),
       JSON_OBJECT('source',r.source,'employeeCount',r.employee_count,'successCount',r.success_count,'failureCount',r.failure_count),
       CONCAT('history-',r.id),
       COALESCE(r.finished_at,r.started_at,r.created_at)
  FROM payroll_runs r
 WHERE NOT EXISTS (SELECT 1 FROM payroll_run_events e WHERE e.payroll_run_id=r.id)
   AND r.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY);
