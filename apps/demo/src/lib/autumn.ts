import { Autumn } from "autumn-js";

import { env } from "@/env";
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
