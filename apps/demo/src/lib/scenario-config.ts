import { env } from "@/env";

export const scenarioConfig = {
  autumn: {
    configured: Boolean(env.AUTUMN_SECRET_KEY),
    label: "Autumn Stripe",
    tab: "autumn-stripe",
  },
  polar: {
    configured: Boolean(
      env.POLAR_DATABASE_URL && env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET,
    ),
    label: "PayKit Polar",
    tab: "paykit-polar",
  },
  stripe: {
    configured: Boolean(
      env.STRIPE_DATABASE_URL && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET,
    ),
    label: "PayKit Stripe",
    tab: "paykit-stripe",
  },
} as const;

export type ScenarioConfig = typeof scenarioConfig;

export function getConfiguredScenarios() {
  return scenarioConfig;
}

export function requireScenarioEnv<T extends string | undefined>(
  value: T,
  name: string,
): NonNullable<T> {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
