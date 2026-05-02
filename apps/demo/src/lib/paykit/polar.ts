import { polar } from "@paykitjs/polar";
import { createPayKit } from "paykitjs";

import { env } from "@/env";
import { auth } from "@/lib/auth";
import { free, pro, ultra } from "@/lib/paykit-products";
import { requireScenarioEnv, scenarioConfig } from "@/lib/scenario-config";
import { getPaykitPolarPool } from "@/server/db";

function createPaykitPolar() {
  return createPayKit({
    basePath: "/paykit-polar",
    database: getPaykitPolarPool(),
    provider: polar({
      accessToken: requireScenarioEnv(env.POLAR_ACCESS_TOKEN, "POLAR_ACCESS_TOKEN"),
      webhookSecret: requireScenarioEnv(env.POLAR_WEBHOOK_SECRET, "POLAR_WEBHOOK_SECRET"),
      server: "sandbox",
    }),
    products: [pro, ultra, free],
    identify: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return null;
      return {
        customerId: session.user.id,
        email: session.user.email,
        name: session.user.name ?? undefined,
      };
    },
  });
}

export type PaykitPolarInstance = ReturnType<typeof createPaykitPolar>;

let paykitPolar: PaykitPolarInstance | undefined;

export function isPaykitPolarConfigured() {
  return scenarioConfig.polar.configured;
}

export function getPaykitPolar() {
  if (!isPaykitPolarConfigured()) return null;
  paykitPolar ??= createPaykitPolar();
  return paykitPolar;
}

export function requirePaykitPolar() {
  const paykit = getPaykitPolar();
  if (!paykit) throw new Error("PayKit Polar is not configured");
  return paykit;
}

export type PayKitPolar = PaykitPolarInstance["$infer"];
