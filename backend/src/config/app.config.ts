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
  storage: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    useSSL: boolean;
    forcePathStyle: boolean;
    publicUrl?: string;
    maxUploadBytes: number;
    uploadExpiresInSeconds: number;
  };
}

export const createAppConfig = (env: Env): AppConfig => {
  const rawUploadMb = env.STORAGE_MAX_UPLOAD_MB
    ? Number(env.STORAGE_MAX_UPLOAD_MB)
    : 25;
  const maxUploadMb =
    Number.isFinite(rawUploadMb) && rawUploadMb > 0 ? rawUploadMb : 25;

  const rawUploadExpiry = env.STORAGE_UPLOAD_EXPIRY_SECONDS
    ? Number(env.STORAGE_UPLOAD_EXPIRY_SECONDS)
    : 300;
  const uploadExpires =
    Number.isFinite(rawUploadExpiry) && rawUploadExpiry >= 60
      ? rawUploadExpiry
      : 300;

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      host: env.HOST ?? '0.0.0.0',
      port: env.PORT ? Number(env.PORT) : 4000,
      corsOrigins: env.CORS_ORIGINS
        ? env.CORS_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : null,
    },
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DATABASE_DIRECT_URL,
      shadowUrl: env.SHADOW_DATABASE_URL,
    },
    storage: {
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
      useSSL:
        env.STORAGE_USE_SSL !== undefined
          ? env.STORAGE_USE_SSL.toLowerCase() === 'true'
          : false,
      forcePathStyle:
        env.STORAGE_FORCE_PATH_STYLE !== undefined
          ? env.STORAGE_FORCE_PATH_STYLE.toLowerCase() === 'true'
          : true,
      publicUrl: env.STORAGE_PUBLIC_URL,
      maxUploadBytes: Math.max(1, maxUploadMb) * 1024 * 1024,
      uploadExpiresInSeconds: uploadExpires,
    },
  };
};

export const configuration = (): AppConfig => {
  const env = validateEnv(process.env as Record<string, unknown>);
  return createAppConfig(env);
};
