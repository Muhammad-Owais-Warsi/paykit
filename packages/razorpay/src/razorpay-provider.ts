import {
  PAYKIT_ERROR_CODES,
  PayKitError,
  type NormalizedWebhookEvent,
  type PayKitProviderConfig,
  type PaymentProvider,
} from "paykitjs";
import type { Payments } from "razorpay/dist/types/payments";
import type { Subscriptions } from "razorpay/dist/types/subscriptions";

export interface RazorpayOptions {
  keyId: string;
  keySecret: string;
}

export type RazorpayProviderConfig = PayKitProviderConfig & {
  capabilities: { testClocks: false };
};

type RazorpaySubscription = Subscriptions.RazorpaySubscription;
type RazorpayPayment = Payments.RazorpayPayment;

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

function createSubscriptionEvents(
  event: { type?: string; data: RazorpaySubscription },
  webhookId: string,
): NormalizedWebhookEvent[] {
  const sub = event.data;
  const normalized = normalizeRazorpaySubscription(sub);

  const providerCustomerId = sub.customer_id;
  if (!providerCustomerId) return [];

  if (event.type === "subscription.cancelled") {
    return [
      {
        actions: [
          {
            data: {
              providerCustomerId,
              providerSubscriptionId: sub.id,
            },
            type: "subscription.delete",
          },
        ],
        name: "subscription.deleted",
        payload: {
          providerCustomerId,
          providerEventId: webhookId,
          providerSubscriptionId: sub.id,
        },
      },
    ];
  }

  return [
    {
      actions: [
        {
          data: {
            providerCustomerId,
            subscription: normalized,
          },
          type: "subscription.upsert",
        },
      ],
      name: "subscription.updated",
      payload: {
        providerCustomerId,
        providerEventId: webhookId,
        subscription: normalized,
      },
    },
  ];
}

function createCheckoutEvents(
  event: { type?: string; data: RazorpayPayment },
  webhookId: string,
): NormalizedWebhookEvent[] {
  const payment = event.data;
  if (payment.status !== "captured") return [];

  const providerCustomerId = payment.customer_id;
  if (!providerCustomerId) return [];

  return [
    {
      name: "checkout.completed",
      payload: {
        checkoutSessionId: payment.id,
        mode: "subscription",
        paymentStatus: "paid",
        providerCustomerId,
        providerEventId: webhookId,
        providerSubscriptionId: payment.subscription_id ?? undefined,
        status: payment.status,
        metadata: payment.notes
          ? Object.fromEntries(Object.entries(payment.notes).map(([k, v]) => [k, String(v)]))
          : undefined,
      },
    },
  ];
}
