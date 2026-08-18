import { defineConfig, env } from "prisma/config";
import { config as loadEnv } from "dotenv";

// Prisma 7 no longer auto-loads .env; the monorepo keeps a single root file.
loadEnv({ path: new URL("../../.env", import.meta.url), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
