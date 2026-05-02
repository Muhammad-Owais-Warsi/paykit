import { Autumn } from "autumn-js";
import { autumnHandler } from "autumn-js/next";

import { env } from "@/env";
import { auth } from "@/lib/auth";
import { scenarioConfig } from "@/lib/scenario-config";

let autumn: Autumn | undefined;

export function isAutumnConfigured() {
  return scenarioConfig.autumn.configured;
}

export function getAutumn() {
  if (!env.AUTUMN_SECRET_KEY) return null;
  autumn ??= new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
  return autumn;
}

export function requireAutumn() {
  const client = getAutumn();
  if (!client) throw new Error("Autumn is not configured");
  return client;
}

export function createAutumnHandler() {
  if (!env.AUTUMN_SECRET_KEY) return null;
  return autumnHandler({
    secretKey: env.AUTUMN_SECRET_KEY,
    identify: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return null;
      }
      return {
        customerId: session.user.id,
        customerData: {
          name: session.user.name ?? undefined,
          email: session.user.email,
        },
      };
    },
  });
}
