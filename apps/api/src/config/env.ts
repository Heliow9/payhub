import { z } from 'zod';

const boolish = z.string().optional().transform((value) => value === 'true' || value === '1');
const intish = (fallback: number) => z.string().optional().transform((value) => value ? Number.parseInt(value, 10) : fallback);

const schema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: intish(3081),
  APP_ORIGIN: z.string().default('https://paayhub.duckdns.org'),
  COOKIE_SECURE: boolish,
  SESSION_TTL_HOURS: intish(12),
  EMPLOYEE_SESSION_TTL_HOURS: intish(168),
  LOGIN_RATE_LIMIT: intish(20),
  DB_HOST: z.string().min(1),
  DB_PORT: intish(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DOCUMENT_STORAGE_PATH: z.string().default('/opt/payhub/storage'),
  SIGNATURE_SEAL_SECRET: z.string().min(32),
  SIGNATURE_LINK_DEFAULT_TTL_MINUTES: intish(1440),
  TSA_URL: z.string().optional().default(''),
  TSA_BEARER_TOKEN: z.string().optional().default(''),
  WORKER_POLL_SECONDS: intish(20),
  CONNECTOR_OFFLINE_SECONDS: intish(90)
});

export type Env = z.infer<typeof schema>;
export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Configuração inválida: ${parsed.error.message}`);
  }
  return parsed.data;
}
