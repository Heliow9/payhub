import type { CreateUserInput, User, UserRepository } from '../../../domain/users/user.repository.js';

export class MemoryUserRepository implements UserRepository {
  readonly users: User[] = [];
  private nextId = 1;

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: this.nextId++,
      ...input,
      email: input.email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return { ...user };
  }

  async findByEmail(email: string): Promise<User | null> {
    const found = this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    return found ? { ...found } : null;
  }

  async findById(id: number): Promise<User | null> {
    const found = this.users.find((user) => user.id === id);
    return found ? { ...found } : null;
  }

  async list(): Promise<User[]> {
    return this.users.map((user) => ({ ...user }));
  }

  async countMasters(): Promise<number> {
    return this.users.filter((user) => user.role === 'MASTER').length;
  }
}
