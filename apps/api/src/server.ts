import { createApp } from './app.js';
import { loadDotEnv } from './config/load-dotenv.js';
import { loadEnv } from './config/env.js';
import { createMySqlPool } from './infra/db/mysql.js';
import { MySqlAuditRepository } from './infra/repositories/mysql/mysql-audit.repository.js';
import { MySqlConnectorRepository } from './infra/repositories/mysql/mysql-connector.repository.js';
import { MySqlImportJobRepository } from './infra/repositories/mysql/mysql-import-job.repository.js';
import { MySqlSessionRepository } from './infra/repositories/mysql/mysql-session.repository.js';
import { MySqlUserRepository } from './infra/repositories/mysql/mysql-user.repository.js';

loadDotEnv();
const env = loadEnv();
const pool = createMySqlPool(env);

const app = createApp({
  users: new MySqlUserRepository(pool),
  sessions: new MySqlSessionRepository(pool),
  audit: new MySqlAuditRepository(pool),
  connectors: new MySqlConnectorRepository(pool),
  importJobs: new MySqlImportJobRepository(pool),
  config: {
    appOrigin: env.APP_ORIGIN,
    cookieSecure: env.COOKIE_SECURE,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    loginRateLimit: env.LOGIN_RATE_LIMIT,
  },
});

const server = app.listen(env.PORT, () => {
  console.log(`PayHub API ouvindo na porta ${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Recebido ${signal}; encerrando PayHub API...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
