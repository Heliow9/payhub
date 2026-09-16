import type { AuditRepository } from '../audit/audit.repository.js';
import type { Session, SessionRepository } from '../sessions/session.repository.js';
import type { User, UserRepository } from '../users/user.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateOpaqueToken, hashToken } from './token.js';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginInput extends RequestContext {
  email: string;
  password: string;
}

export interface LoginResult {
  user: User;
  session: Session;
  sessionToken: string;
  csrfToken: string;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciais inválidas.');
    this.name = 'InvalidCredentialsError';
  }
}

export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly audit: AuditRepository;
  private readonly sessionTtlHours: number;

  constructor(
    users: UserRepository,
    sessions: SessionRepository,
    audit: AuditRepository,
    sessionTtlHours: number,
  ) {
    this.users = users;
    this.sessions = sessions;
    this.audit = audit;
    this.sessionTtlHours = sessionTtlHours;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const passwordMatches = user ? await verifyPassword(input.password, user.passwordHash) : false;

    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      await this.audit.record({
        actorUserId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        targetType: 'USER',
        targetId: user ? String(user.id) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { attemptedEmail: email },
      });
      throw new InvalidCredentialsError();
    }

    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);
    const session = await this.sessions.create({
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt,
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'SESSION',
      targetId: String(session.id),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { user, session, sessionToken, csrfToken };
  }

  async resolveSession(sessionToken: string): Promise<{ user: User; session: Session } | null> {
    if (!sessionToken) return null;
    const now = new Date();
    const session = await this.sessions.findActiveByTokenHash(hashToken(sessionToken), now);
    if (!session) return null;

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') return null;

    await this.sessions.touch(session.id, now);
    return { user, session: { ...session, lastSeenAt: now } };
  }

  async logout(sessionToken: string, context: RequestContext = {}): Promise<void> {
    if (!sessionToken) return;
    const now = new Date();
    const session = await this.sessions.findActiveByTokenHash(hashToken(sessionToken), now);
    if (!session) return;

    await this.sessions.revoke(session.id, now);
    await this.audit.record({
      actorUserId: session.userId,
      action: 'LOGOUT',
      targetType: 'SESSION',
      targetId: String(session.id),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
  }
}

export async function createPasswordHash(password: string): Promise<string> {
  return hashPassword(password);
}
