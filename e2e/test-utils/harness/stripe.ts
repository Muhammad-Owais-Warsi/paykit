import { stripe } from "@paykitjs/stripe";
import { chromium } from "playwright";
import { default as Stripe } from "stripe";

import type { PaymentProvider } from "../../../packages/paykit/src/providers/provider";
import { env } from "../env";
import type { ProviderHarness } from "./types";

export function createStripeHarness(): ProviderHarness {
  validateStripeEnv();
  const secretKey = env.E2E_STRIPE_SK;
  const webhookSecret = env.E2E_STRIPE_WHSEC;

  const stripeClient = new Stripe(secretKey, { maxNetworkRetries: 3 });

  return {
    id: "stripe",
    capabilities: {
      testClocks: true,
      directSubscription: true,
    },

    createProviderConfig() {
      return stripe({ secretKey, webhookSecret });
    },

    applyTestingOverrides(ctx) {
      // Stripe's real createSubscription uses payment_behavior: "default_incomplete",
      // which requires client-side confirmation via Stripe.js. In tests we want the
      // subscription to activate straight away from the server after a PM is attached.
      const provider = ctx.provider as PaymentProvider;
      provider.createSubscription = async (
        data: Parameters<PaymentProvider["createSubscription"]>[0],
      ) => {
        const sub = await stripeClient.subscriptions.create({
          customer: data.providerCustomerId,
          items: [{ price: data.providerProduct.priceId }],
          payment_behavior: "allow_incomplete",
          expand: ["latest_invoice"],
        });

        const firstItem = sub.items.data[0];
        const periodStart = firstItem?.current_period_start ?? null;
        const periodEnd = firstItem?.current_period_end ?? null;
        const latestInvoice = sub.latest_invoice;
        const inv =
          latestInvoice && typeof latestInvoice !== "string"
            ? {
                currency: latestInvoice.currency,
                hostedUrl: latestInvoice.hosted_invoice_url ?? null,
                periodEndAt: latestInvoice.period_end
                  ? new Date(latestInvoice.period_end * 1000)
                  : null,
                periodStartAt: latestInvoice.period_start
                  ? new Date(latestInvoice.period_start * 1000)
                  : null,
                providerInvoiceId: latestInvoice.id,
                status: latestInvoice.status,
                totalAmount: latestInvoice.total,
              }
            : null;

        return {
          invoice: inv,
          paymentUrl: null,
          subscription: {
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            canceledAt: sub.canceled_at != null ? new Date(sub.canceled_at * 1000) : null,
            currentPeriodEndAt: periodEnd != null ? new Date(periodEnd * 1000) : null,
            currentPeriodStartAt: periodStart != null ? new Date(periodStart * 1000) : null,
            endedAt: sub.ended_at != null ? new Date(sub.ended_at * 1000) : null,
            providerSubscriptionId: sub.id,
            providerSubscriptionScheduleId: null,
            status: sub.status,
          },
        };
      };
    },

    async setupCustomerForDirectSubscription(providerCustomerId: string) {
      const pm = await stripeClient.paymentMethods.attach("pm_card_visa", {
        customer: providerCustomerId,
      });
      await stripeClient.customers.update(providerCustomerId, {
        invoice_settings: { default_payment_method: pm.id },
      });
    },

    async completeCheckout(url: string) {
      const browser = await chromium.launch({ headless: true });

      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });

        // Stripe's hosted checkout uses custom inputs that require per-key events;
        // fill() does not dispatch them correctly, so use pressSequentially.
        const cardNumber = page.locator("#cardNumber");
        await cardNumber.waitFor({ timeout: 60_000 });
        await cardNumber.pressSequentially("4242424242424242");

        const cardExpiry = page.locator("#cardExpiry");
        await cardExpiry.waitFor({ timeout: 30_000 });
        await cardExpiry.pressSequentially("1234");

        const cardCvc = page.locator("#cardCvc");
        await cardCvc.waitFor({ timeout: 30_000 });
        await cardCvc.pressSequentially("123");

        const billingName = page.locator("#billingName");
        if (await billingName.isVisible().catch(() => false)) {
          await billingName.pressSequentially("Test Customer");
        }

        const submitBtn = page.locator(".SubmitButton-TextContainer").first();
        await submitBtn.click();

        // Wait for Stripe to navigate away from the checkout page (success redirect
        // or embedded confirmation). Don't fail the test if this times out — the
        // webhook poll downstream is the real signal.
        await page
          .waitForURL((u) => !u.toString().includes("checkout.stripe.com"), {
            timeout: 60_000,
          })
          .catch(() => {});
      } finally {
        await browser.close();
      }
    },

    async cleanup(ctx) {
      // Delete test clocks for all customers
      for (const providerCustomerId of ctx.providerCustomerIds) {
        try {
          const customer = await stripeClient.customers.retrieve(providerCustomerId);
          if ("deleted" in customer && customer.deleted) continue;
          const testClockId = (customer as Stripe.Customer).test_clock;
          if (testClockId && typeof testClockId === "string") {
            await stripeClient.testHelpers.testClocks.del(testClockId).catch(() => {});
          }
        } catch {
          // Customer may already be deleted
        }
      }
    },

    validateEnv() {
      validateStripeEnv();
    },
  };
}

function validateStripeEnv(): void {
  if (!env.E2E_STRIPE_SK || !env.E2E_STRIPE_WHSEC) {
    throw new Error("E2E_STRIPE_SK and E2E_STRIPE_WHSEC must be set");
  }
}
