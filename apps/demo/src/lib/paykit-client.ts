import { createPayKitClient } from "paykitjs/client";

import type { PaykitPolarInstance } from "@/lib/paykit/polar";
import type { PaykitStripeInstance } from "@/lib/paykit/stripe";

type ClientInstance<T> = T & { options: { identify: (...args: never[]) => unknown } };

export const paykitPolarClient = createPayKitClient<ClientInstance<PaykitPolarInstance>>({
  baseURL: "/paykit-polar",
});

export const paykitStripeClient = createPayKitClient<ClientInstance<PaykitStripeInstance>>({
  baseURL: "/paykit-stripe",
});
