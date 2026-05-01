import { createRouter } from "better-call";

import type { PayKitContext } from "../core/context";
import {
  customerPortal,
  deleteCustomer,
  getCustomer,
  listCustomersMethod,
  upsertCustomer,
} from "../customer/customer.api";
import { check, report } from "../entitlement/entitlement.api";
import { subscribe } from "../subscription/subscription.api";
import { advanceTestClock, getTestClock } from "../testing/testing.api";
import type { PayKitOptions } from "../types/options";
import { receiveWebhook } from "../webhook/webhook.api";
import type { PayKitMethod } from "./define-route";

export const baseMethods = {
  subscribe,
  customerPortal,
  upsertCustomer,
  getCustomer,
  deleteCustomer,
  listCustomers: listCustomersMethod,
  check,
  report,
  handleWebhook: receiveWebhook,
} as const;

export const testingMethods = {
  getTestClock,
  advanceTestClock,
} as const;

export const methods = {
  ...baseMethods,
  ...testingMethods,
} as const;

type MethodMap = Record<string, PayKitMethod<never, unknown>>;

type ClientMethodKeys<TMethods extends MethodMap> = {
  [K in keyof TMethods]-?: TMethods[K] extends { client: true } ? K : never;
}[keyof TMethods];

type WrappedMethod<TMethod> =
  TMethod extends PayKitMethod<infer TInput, infer TResult>
    ? ((input: TInput) => Promise<TResult>) &
        (TMethod extends { endpoint: infer TEndpoint extends { options: unknown; path: string } }
          ? { options: TEndpoint["options"]; path: TEndpoint["path"] }
          : {})
    : never;

type WrappedMethodMap<TMethods extends Record<string, unknown>> = {
  [K in keyof TMethods]: WrappedMethod<TMethods[K]>;
};

const baseClientMethods = pickMethods(baseMethods as typeof baseMethods & MethodMap);
const allClientMethods = pickMethods(methods as typeof methods & MethodMap);

export const clientMethods = baseClientMethods;

function pickMethods<TMethods extends MethodMap>(
  source: TMethods,
): Pick<TMethods, ClientMethodKeys<TMethods>> {
  return Object.fromEntries(
    (Object.entries(source) as Array<[keyof TMethods, TMethods[keyof TMethods]]>).filter(
      ([, method]) => method.client === true,
    ),
  ) as Pick<TMethods, ClientMethodKeys<TMethods>>;
}

function wrapMethods<TMethods extends MethodMap>(
  source: TMethods,
  ctx: PayKitContext | Promise<PayKitContext>,
): WrappedMethodMap<TMethods> {
  const wrapped = Object.fromEntries(
    (Object.entries(source) as Array<[keyof TMethods, TMethods[keyof TMethods]]>).map(
      ([key, method]) => {
        const fn = async (input: unknown) => {
          const resolved = await ctx;
          return (method as unknown as PayKitMethod<unknown, unknown>)(resolved, input);
        };

        if (method.endpoint) {
          Object.assign(fn, {
            options: method.endpoint.options,
            path: method.endpoint.path,
          });
        }

        return [key, fn];
      },
    ),
  );

  return wrapped as WrappedMethodMap<TMethods>;
}

function getRouteEndpoints<TMethods extends MethodMap>(source: TMethods) {
  return Object.fromEntries(
    (Object.entries(source) as Array<[keyof TMethods, TMethods[keyof TMethods]]>).flatMap(
      ([key, method]) => (method.endpoint ? [[key, method.endpoint]] : []),
    ),
  );
}

function isTestingEnabled(options: Pick<PayKitOptions, "testing">): boolean {
  return options.testing?.enabled === true;
}

function isTestingAvailable(options: Pick<PayKitOptions, "provider" | "testing">): boolean {
  return isTestingEnabled(options) && options.provider.capabilities.testClocks;
}

export function getClientApi(
  ctx: PayKitContext | Promise<PayKitContext>,
  options: Pick<PayKitOptions, "provider" | "testing">,
) {
  return wrapMethods(isTestingAvailable(options) ? allClientMethods : baseClientMethods, ctx);
}

export function getApi(
  ctx: PayKitContext | Promise<PayKitContext>,
  options: Pick<PayKitOptions, "provider" | "testing">,
) {
  return wrapMethods(
    isTestingAvailable(options)
      ? (methods as typeof methods & MethodMap)
      : (baseMethods as typeof baseMethods & MethodMap),
    ctx,
  );
}

export function createPayKitRouter(ctx: PayKitContext, options: PayKitOptions) {
  const pluginEndpoints = Object.assign(
    {},
    ...(options.plugins ?? []).map((plugin) => plugin.endpoints ?? {}),
  );
  const routeEndpoints = getRouteEndpoints(
    isTestingAvailable(options)
      ? (methods as typeof methods & MethodMap)
      : (baseMethods as typeof baseMethods & MethodMap),
  );

  return createRouter(
    { ...routeEndpoints, ...pluginEndpoints },
    {
      basePath: options.basePath ?? "/paykit/api",
      routerContext: ctx,
      onError(error) {
        ctx.logger.error({ err: error }, "API error");
      },
    },
  );
}
