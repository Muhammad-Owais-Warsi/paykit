import { definePayKitMethod } from "../api/define-route";
import { handleWebhook } from "./webhook.service";

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function shouldAllowStaleSignatures(headers: Headers): boolean {
  return process.env.NODE_ENV !== "production" && headers.get("x-paykit-cloud-replay") === "1";
}

/** Applies an incoming provider webhook payload. */
export const receiveWebhook = definePayKitMethod(
  {
    route: {
      disableBody: true,
      method: "POST",
      path: "/webhook",
      requireHeaders: true,
      requireRequest: true,
      resolveInput: async (ctx) => {
        const headers = ctx.headers ?? new Headers();
        return {
          allowStaleSignatures: shouldAllowStaleSignatures(headers),
          body: await ctx.request!.text(),
          headers: headersToRecord(headers),
        };
      },
    },
  },
  // TODO: if we'll add multiple providers on one app, we gotta make sure detecting provider based on request HERE
  async (ctx) => handleWebhook(ctx.paykit, ctx.input),
);
