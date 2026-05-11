import {
  PAYKIT_ERROR_CODES,
  PayKitError,
  type NormalizedWebhookEvent,
  type PayKitProviderConfig,
  type PaymentProvider,
} from "paykitjs";
import type { Subscriptions } from "razorpay/dist/types/subscriptions";

export interface RazorpayOptions {
  keyId: string;
  keySecret: string;
}

export type RazorpayProviderConfig = PayKitProviderConfig & {
  capabilities: { testClocks: false };
};

type RazorpaySubscription = Subscriptions.RazorpaySubscription;

function notSupported(method: string): never {
  throw PayKitError.from(
    "BAD_REQUEST",
    PAYKIT_ERROR_CODES.PROVIDER_WEBHOOK_INVALID,
    `${method} is not supported by the Razorpay provider.`,
  );
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeRazorpaySubscription(sub: RazorpaySubscription) {
  return {
    cancelAtPeriodEnd: sub.status === "active" && sub.end_at === sub.current_end ? true : false,
    canceledAt: sub.status === "cancelled" ? new Date() : null,
    currentPeriodEndAt: toDate(sub.current_end),
    currentPeriodStartAt: toDate(sub.current_start),
    endedAt: toDate(sub.ended_at),
    providerProduct: { productId: sub.plan_id },
    providerSubscriptionId: sub.id,
    providerSubscriptionScheduleId: null,
    status: sub.status,
  };
}
