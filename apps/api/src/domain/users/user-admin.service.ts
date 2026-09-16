import type { AuditRepository } from '../audit/audit.repository.js';
import type { RequestContext } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';
import type { User, UserRepository } from './user.repository.js';

export interface CreateAnalystInput {
  name: string;
  email: string;
  password: string;
}

export class ForbiddenError extends Error {
  constructor() {
    super('Acesso negado.');
    this.name = 'ForbiddenError';
  }
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

export class UserAdminService {
  private readonly users: UserRepository;
  private readonly audit: AuditRepository;

  constructor(users: UserRepository, audit: AuditRepository) {
    this.users = users;
    this.audit = audit;
  }

  async list(actor: User): Promise<User[]> {
    this.assertMaster(actor);
    return this.users.list();
  }

  async createAnalyst(actor: User, input: CreateAnalystInput, context: RequestContext = {}): Promise<User> {
    this.assertMaster(actor);
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();

    if (name.length < 2 || name.length > 120) {
      throw new UserValidationError('Nome deve ter entre 2 e 120 caracteres.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UserValidationError('E-mail inválido.');
    }
    if (input.password.length < 10) {
      throw new UserValidationError('A senha deve ter pelo menos 10 caracteres.');
    }
    if (await this.users.findByEmail(email)) {
      throw new UserValidationError('Já existe um usuário com este e-mail.');
    }

    const user = await this.users.create({
      name,
      email,
      passwordHash: await hashPassword(input.password),
      role: 'ANALISTA',
      status: 'ACTIVE',
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: 'ANALYST_CREATED',
      targetType: 'USER',
      targetId: String(user.id),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: { email: user.email },
    });

    return user;
  }

  private assertMaster(actor: User): void {
    if (actor.status !== 'ACTIVE' || actor.role !== 'MASTER') {
      throw new ForbiddenError();
    }
  }
}
