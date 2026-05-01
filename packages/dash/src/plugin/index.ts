import { createPayKitEndpoint } from "paykitjs";
import type { PayKitPlugin } from "paykitjs";

import { getDashboardHTML, getUnauthorizedHTML } from "./html";

export interface DashPluginOptions {
  authorize?: (request: Request) => Promise<void>;
}

export function dash(options?: DashPluginOptions): PayKitPlugin {
  return {
    id: "dash",
    endpoints: {
      dashUI: createPayKitEndpoint("/dash", { method: "GET" }, async (ctx) => {
        if (options?.authorize) {
          try {
            await options.authorize(ctx.request!);
          } catch {
            return new Response(getUnauthorizedHTML(), {
              status: 401,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
        }

        return new Response(getDashboardHTML(ctx.context.basePath), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }),
    },
  };
}
