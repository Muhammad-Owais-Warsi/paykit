import type { Pool } from "pg";
import type { LevelWithSilent, Logger } from "pino";

import type { PayKitProviderConfig } from "../providers/provider";
import type { PayKitEventHandlers } from "./events";
import type { PayKitPlugin } from "./plugin";
import type { PayKitPlansModule } from "./schema";

export interface PayKitLoggingOptions {
  level?: LevelWithSilent;
  logger?: Logger;
}

export interface PayKitTestingOptions {
  enabled: true;
}

export interface PayKitOptions {
  database: Pool | string;
  provider: PayKitProviderConfig;
  plans?: PayKitPlansModule;
  /**
   * PayKit root path, e.g. `/paykit` or `/billing`.
   * API routes are exposed under `${basePath}/api` and webhooks under `${basePath}/webhook`.
   * @default "/paykit"
   */
  basePath?: string;
  identify?: (request: Request) => Promise<{
    customerId: string;
    email?: string;
    name?: string;
  } | null>;
  on?: PayKitEventHandlers;
  plugins?: PayKitPlugin[];
  logging?: PayKitLoggingOptions;
  testing?: PayKitTestingOptions;
}
