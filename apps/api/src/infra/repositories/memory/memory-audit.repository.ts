import type { AuditEntry, AuditInput, AuditRepository } from '../../../domain/audit/audit.repository.js';

export class MemoryAuditRepository implements AuditRepository {
  readonly entries: AuditEntry[] = [];
  private nextId = 1;

  async record(input: AuditInput): Promise<void> {
    this.entries.push({
      id: this.nextId++,
      ...input,
      createdAt: new Date(),
    });
  }
}
