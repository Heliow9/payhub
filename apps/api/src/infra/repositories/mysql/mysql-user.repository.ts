import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CreateUserInput, User, UserRepository } from '../../../domain/users/user.repository.js';

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: 'MASTER' | 'ANALISTA';
  status: 'ACTIVE' | 'DISABLED';
  created_at: Date;
  updated_at: Date;
}

function mapUser(row: UserRow): User {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class MySqlUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.name, input.email.toLowerCase(), input.passwordHash, input.role, input.status, now, now],
    );
    const user = await this.findById(result.insertId);
    if (!user) throw new Error('Usuário criado não pôde ser carregado.');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id: number): Promise<User | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async list(): Promise<User[]> {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT * FROM users ORDER BY name ASC, id ASC',
    );
    return rows.map(mapUser);
  }

  async countMasters(): Promise<number> {
    const [rows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'MASTER'`,
    );
    return Number(rows[0]?.total ?? 0);
  }
}
