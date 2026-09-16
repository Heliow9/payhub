import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: booleanFromString,
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().min(1).default('pay_hub'),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
