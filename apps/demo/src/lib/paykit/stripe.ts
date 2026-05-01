import { stripe } from "@paykitjs/stripe";
import { createPayKit } from "paykitjs";

import { env } from "@/env";
import { auth } from "@/lib/auth";
import { free, pro, ultra } from "@/lib/paykit-products";
import { requireScenarioEnv, scenarioConfig } from "@/lib/scenario-config";
import { getPaykitStripePool } from "@/server/db";

function createPaykitStripe() {
  return createPayKit({
    basePath: "/paykit-stripe",
    database: getPaykitStripePool(),
    provider: stripe({
      secretKey: requireScenarioEnv(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY"),
      webhookSecret: requireScenarioEnv(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET"),
    }),
    testing: { enabled: true },
    plans: [pro, ultra, free],
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

export type PaykitStripeInstance = ReturnType<typeof createPaykitStripe>;

let paykitStripe: PaykitStripeInstance | undefined;

export function isPaykitStripeConfigured() {
  return scenarioConfig.stripe.configured;
}

export function getPaykitStripe() {
  if (!isPaykitStripeConfigured()) return null;
  paykitStripe ??= createPaykitStripe();
  return paykitStripe;
}

export function requirePaykitStripe() {
  const paykit = getPaykitStripe();
  if (!paykit) throw new Error("PayKit Stripe is not configured");
  return paykit;
}

export type PayKitStripe = PaykitStripeInstance["$infer"];
