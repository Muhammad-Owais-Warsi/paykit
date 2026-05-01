import { Pool } from "pg";

import { env } from "@/env";

const globalForPool = globalThis as typeof globalThis & {
  demoAuthPool?: Pool;
  demoPaykitPolarPool?: Pool;
  demoPaykitStripePool?: Pool;
};

export const authPool =
  globalForPool.demoAuthPool ?? new Pool({ connectionString: env.AUTH_DATABASE_URL });

export function getPaykitPolarPool() {
  if (!env.POLAR_DATABASE_URL) {
    throw new Error("Missing POLAR_DATABASE_URL");
  }
  globalForPool.demoPaykitPolarPool ??= new Pool({ connectionString: env.POLAR_DATABASE_URL });
  return globalForPool.demoPaykitPolarPool;
}

export function getPaykitStripePool() {
  if (!env.STRIPE_DATABASE_URL) {
    throw new Error("Missing STRIPE_DATABASE_URL");
  }
  globalForPool.demoPaykitStripePool ??= new Pool({ connectionString: env.STRIPE_DATABASE_URL });
  return globalForPool.demoPaykitStripePool;
}

if (process.env.NODE_ENV !== "production") {
  globalForPool.demoAuthPool = authPool;
}
