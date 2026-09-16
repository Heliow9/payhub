import type { CreateSessionInput, Session, SessionRepository } from '../../../domain/sessions/session.repository.js';

export class MemorySessionRepository implements SessionRepository {
  readonly sessions: Session[] = [];
  private nextId = 1;

  async create(input: CreateSessionInput): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: this.nextId++,
      ...input,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    this.sessions.push(session);
    return { ...session };
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    const found = this.sessions.find(
      (session) =>
        session.tokenHash === tokenHash &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > now.getTime(),
    );
    return found ? { ...found } : null;
  }

  async touch(id: number, at: Date): Promise<void> {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.lastSeenAt = at;
  }

  async revoke(id: number, at: Date): Promise<void> {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.revokedAt = at;
  }
}
