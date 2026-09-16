export interface AuditInput {
  actorUserId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEntry extends AuditInput {
  id: number;
  createdAt: Date;
}

export interface AuditRepository {
  record(input: AuditInput): Promise<void>;
}
