import { hashPassword } from '../domain/auth/password.js';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../infra/db/mysql.js';
import { MySqlAuditRepository } from '../infra/repositories/mysql/mysql-audit.repository.js';
import { MySqlUserRepository } from '../infra/repositories/mysql/mysql-user.repository.js';

loadDotEnv();
const env = loadEnv();
const name = (process.env.MASTER_NAME ?? '').trim();
const email = (process.env.MASTER_EMAIL ?? '').trim().toLowerCase();
const password = process.env.MASTER_PASSWORD ?? '';

if (name.length < 2 || name.length > 120) throw new Error('MASTER_NAME inválido.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('MASTER_EMAIL inválido.');
if (password.length < 12) throw new Error('MASTER_PASSWORD deve ter pelo menos 12 caracteres.');

const pool = createMySqlPool(env);
try {
  const users = new MySqlUserRepository(pool);
  if ((await users.countMasters()) > 0) {
    throw new Error('Já existe um usuário MASTER. O bootstrap inicial foi bloqueado.');
  }
  if (await users.findByEmail(email)) throw new Error('Já existe um usuário com MASTER_EMAIL.');

  const master = await users.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'MASTER',
    status: 'ACTIVE',
  });
  await new MySqlAuditRepository(pool).record({
    actorUserId: master.id,
    action: 'MASTER_BOOTSTRAPPED',
    targetType: 'USER',
    targetId: String(master.id),
    metadata: { email: master.email },
  });
  console.log(`MASTER inicial criado: ${master.email}`);
} finally {
  await pool.end();
}
