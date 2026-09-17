CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  principal_type ENUM('USER','EMPLOYEE') NOT NULL,
  principal_id BIGINT UNSIGNED NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth_secret VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  last_success_at DATETIME NULL,
  last_failure_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_push_subscription_endpoint (endpoint_hash),
  KEY idx_push_subscription_principal (principal_type,principal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_preferences (
  principal_type ENUM('USER','EMPLOYEE') NOT NULL,
  principal_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (principal_type,principal_id,category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_type ENUM('USER','EMPLOYEE') NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(64) NOT NULL,
  title VARCHAR(190) NOT NULL,
  body VARCHAR(500) NOT NULL,
  url VARCHAR(500) NULL,
  dedup_key VARCHAR(190) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notifications_dedup (dedup_key),
  KEY idx_notifications_recipient (recipient_type,recipient_id,created_at),
  KEY idx_notifications_unread (recipient_type,recipient_id,read_at,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
