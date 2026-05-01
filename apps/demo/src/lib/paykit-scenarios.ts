export type PayKitScenario = "polar" | "stripe";

export const paykitScenarios = [
  { id: "polar", label: "PayKit Polar", tab: "paykit-polar" },
  { id: "stripe", label: "PayKit Stripe", tab: "paykit-stripe" },
] as const satisfies ReadonlyArray<{ id: PayKitScenario; label: string; tab: string }>;
