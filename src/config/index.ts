import dotenv from 'dotenv';
import { z } from 'zod';

import type { AppConfig } from '../types/index.js';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string().default('fileguard'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('50'),

  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.string().transform(Number).default('3310'),
  CLAMAV_TIMEOUT: z.string().transform(Number).default('60000'),

  WORKER_CONCURRENCY: z.string().transform(Number).default('2'),
  JOB_TIMEOUT_MS: z.string().transform(Number).default('300000'),
});

function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

const env = parseEnv();

export const config: AppConfig = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  database: {
    url:
      env.DATABASE_URL ??
      `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL,
  },

  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },

  storage: {
    type: env.STORAGE_TYPE,
    uploadDir: env.UPLOAD_DIR,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
  },

  clamav: {
    host: env.CLAMAV_HOST,
    port: env.CLAMAV_PORT,
    timeout: env.CLAMAV_TIMEOUT,
  },

  worker: {
    concurrency: env.WORKER_CONCURRENCY,
    jobTimeoutMs: env.JOB_TIMEOUT_MS,
  },
};

export const isDev = config.env === 'development';

export const isProd = config.env === 'production';

export const isTest = config.env === 'test';

export default config;
