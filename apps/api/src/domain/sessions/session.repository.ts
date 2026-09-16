export interface Session {
  id: number;
  userId: number;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionInput {
  userId: number;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<Session | null>;
  touch(id: number, at: Date): Promise<void>;
  revoke(id: number, at: Date): Promise<void>;
}
