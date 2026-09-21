import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(new URL('../db/migrations/006_durable_worker.sql', import.meta.url), 'utf8');

describe('006_durable_worker.sql', () => {
  it('cria lease, heartbeat, outbox e backfill compatível', () => {
    expect(sql).toContain('normalization_state');
    expect(sql).toContain('normalization_lease_until');
    expect(sql).toContain('normalization_attempt_count');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS worker_heartbeats');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS notification_outbox');
    expect(sql).toMatch(/SET normalization_state='COMPLETED'[\s\S]+normalized_at IS NOT NULL/i);
    expect(sql).toMatch(/SET normalization_state='PENDING'[\s\S]+status='COMPLETED'[\s\S]+normalized_at IS NULL/i);
    expect(sql).toMatch(/UNIQUE KEY uk_notification_outbox_notification \(notification_id\)/i);
  });
});
