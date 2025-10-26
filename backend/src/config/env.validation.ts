import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.string().optional(),
  HOST: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_DIRECT_URL: z.string().min(1, 'DATABASE_DIRECT_URL is required'),
  SHADOW_DATABASE_URL: z.string().min(1, 'SHADOW_DATABASE_URL is required'),
  CORS_ORIGINS: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().min(1, 'STORAGE_REGION is required'),
  STORAGE_BUCKET: z.string().min(1, 'STORAGE_BUCKET is required'),
  STORAGE_ACCESS_KEY: z.string().min(1, 'STORAGE_ACCESS_KEY is required'),
  STORAGE_SECRET_KEY: z.string().min(1, 'STORAGE_SECRET_KEY is required'),
  STORAGE_USE_SSL: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  STORAGE_MAX_UPLOAD_MB: z.string().optional(),
  STORAGE_UPLOAD_EXPIRY_SECONDS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(parsed.error.flatten().formErrors.join('\n'));
  }
  return parsed.data;
};
