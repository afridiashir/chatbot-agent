import { z } from "zod";

/**
 * Fail fast on boot rather than surfacing a confusing runtime error later.
 * Nothing in here has a hardcoded fallback for secrets.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  /**
   * Comma-separated list of allowed browser origins. A single `*` entry lets
   * the widget run on any website; admin and sign-in routes stay restricted to
   * the named origins either way (see createApp).
   */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3002,http://localhost:3003"),
  /** MinIO / S3 for chat media. */
  MINIO_ENDPOINT: z.url("MINIO_ENDPOINT must be a URL"),
  /** The address browsers use to reach MinIO; defaults to MINIO_ENDPOINT. */
  MINIO_PUBLIC_URL: z.url("MINIO_PUBLIC_URL must be a URL").optional(),
  MINIO_ACCESS_KEY: z.string().min(3, "MINIO_ACCESS_KEY is required"),
  MINIO_SECRET_KEY: z.string().min(8, "MINIO_SECRET_KEY must be at least 8 characters"),
  MINIO_BUCKET: z.string().min(3).default("chat-media"),
  MINIO_REGION: z.string().default("us-east-1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  MINIO_PUBLIC_URL: parsed.data.MINIO_PUBLIC_URL ?? parsed.data.MINIO_ENDPOINT,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*"),
  /** `*` in CORS_ORIGINS: any website may embed the widget. */
  allowAnyWidgetOrigin: parsed.data.CORS_ORIGINS.split(",").some((o) => o.trim() === "*"),
};

export const isProduction = env.NODE_ENV === "production";
