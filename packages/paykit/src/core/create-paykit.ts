import { Pool } from "pg";
import picocolors from "picocolors";

import { createPayKitRouter, getApi } from "../api/methods";
import { getPendingMigrationCount } from "../database/index";
import { dryRunSyncProducts } from "../product/product-sync.service";
import type { PayKitAPI, PayKitInstance } from "../types/instance";
import type { PayKitOptions } from "../types/options";
import { checkPayKitDependencies } from "../utilities/dependencies/index";
import { createContext, type PayKitContext } from "./context";

const payKitInstanceSymbol = Symbol.for("paykit.instance");

export function isPayKitInstance(value: unknown): value is PayKitInstance {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<PropertyKey, unknown>)[payKitInstanceSymbol] === true
  );
}

const _global = globalThis as unknown as { __paykitDevChecksRan?: boolean };

async function runDevChecks(ctx: PayKitContext, pool: Pool): Promise<void> {
  if (_global.__paykitDevChecksRan) return;
  _global.__paykitDevChecksRan = true;
  if (process.env.PAYKIT_DISABLE_DEPENDENCY_CHECKER !== "1") {
    await checkPayKitDependencies();
  }

  await Promise.allSettled([
    getPendingMigrationCount(pool).then((count) => {
      if (count > 0) {
        console.warn(
          `${picocolors.yellow("[paykit]")} ${count} pending migration${count === 1 ? "" : "s"}. Run ${picocolors.bold("paykitjs push")} to apply.`,
        );
      }
    }),
    dryRunSyncProducts(ctx).then((results) => {
      const outOfSync = results.filter((r) => r.action !== "unchanged");
      if (outOfSync.length > 0) {
        console.warn(
          `${picocolors.yellow("[paykit]")} ${outOfSync.length} product${outOfSync.length === 1 ? "" : "s"} out of sync: ${outOfSync.map((r) => r.id).join(", ")}. Run ${picocolors.bold("paykitjs push")} to update.`,
        );
      }
    }),
  ]);
}

async function initContext(options: PayKitOptions): Promise<PayKitContext> {
  const pool =
    typeof options.database === "string"
      ? new Pool({ connectionString: options.database })
      : options.database;
  const ctx = await createContext({ ...options, database: pool });

  if (process.env.NODE_ENV !== "production" && !process.env.PAYKIT_CLI) {
    runDevChecks(ctx, pool).catch(() => {});
  }

  return ctx;
}

export function createPayKit<const TOptions extends PayKitOptions>(
  options: TOptions,
): PayKitInstance<TOptions> {
  let contextPromise: Promise<PayKitContext> | undefined;
  const getContext = () => {
    contextPromise ??= initContext(options);
    return contextPromise;
  };

  const api = getApi(getContext(), options) as unknown as PayKitAPI<TOptions>;
  const paykit: PayKitInstance<TOptions> = {
    options,

    async handler(request: Request) {
      const ctx = await getContext();
      const router = createPayKitRouter(ctx);
      return router.handler(request);
    },

    ...api,

    get $context() {
      return getContext();
    },

    $infer: undefined as never,
  };

  Object.defineProperty(paykit, payKitInstanceSymbol, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  return paykit;
}
