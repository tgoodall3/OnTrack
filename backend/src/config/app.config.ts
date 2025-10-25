import { Env, validateEnv } from './env.validation';

export interface AppConfig {
  app: {
    nodeEnv: Env['NODE_ENV'];
    host: string;
    port: number;
    corsOrigins: string[] | null;
  };
  database: {
    url: string;
    directUrl: string;
    shadowUrl: string;
  };
}

export const createAppConfig = (env: Env): AppConfig => ({
  app: {
    nodeEnv: env.NODE_ENV,
    host: env.HOST ?? '0.0.0.0',
    port: env.PORT ? Number(env.PORT) : 4000,
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean) : null,
  },
  database: {
    url: env.DATABASE_URL,
    directUrl: env.DATABASE_DIRECT_URL,
    shadowUrl: env.SHADOW_DATABASE_URL,
  },
});

export const configuration = (): AppConfig => {
  const env = validateEnv(process.env as Record<string, unknown>);
  return createAppConfig(env);
};
