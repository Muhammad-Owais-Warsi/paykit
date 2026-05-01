import type { PayKit } from "@/lib/paykit";

export const planCatalog = [
  {
    description: "100 messages / month",
    id: "free",
    name: "Free",
    priceAmount: null,
  },
  {
    description: "2,000 messages, pro models",
    id: "pro",
    name: "Pro",
    priceAmount: 1900,
  },
  {
    description: "10,000 messages, priority support",
    id: "ultra",
    name: "Ultra",
    priceAmount: 4900,
  },
] as const satisfies ReadonlyArray<{
  description: string;
  id: PayKit["planId"];
  name: string;
  priceAmount: number | null;
}>;

export const featureCatalog = [
  {
    description: "Send an AI message",
    id: "messages",
    name: "Messages",
    type: "metered" as const,
  },
  {
    description: "Access to advanced AI models",
    id: "pro_models",
    name: "Pro Models",
    type: "boolean" as const,
  },
  {
    description: "Dedicated priority support channel",
    id: "priority_support",
    name: "Priority Support",
    type: "boolean" as const,
  },
];

export type PlanId = (typeof planCatalog)[number]["id"];
