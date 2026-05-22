import { AsyncLocalStorage } from "node:async_hooks";
import { Transform } from "node:stream";

import pino from "pino";
import pretty from "pino-pretty";

import type { PayKitLoggingOptions } from "../types/options";
import { generateId } from "./utils";

const storage = new AsyncLocalStorage<pino.Logger>();
const PRETTY_LOG_IGNORE_FIELDS = "pid,hostname";
const PRETTY_LOG_TIMESTAMP = "SYS:HH:MM:ss";
const DEFAULT_LOG_LEVEL = "info";
const dim = (value: unknown) => `\x1b[2m${String(value)}\x1b[0m`;
const plain = (value: unknown) => `\x1b[39m${String(value)}\x1b[39m`;
const DETAIL_LINE_PATTERN = /(^|\n)(\s+[^\n]+)/g;

function dimDetailLines(input: string): string {
  return input.replace(DETAIL_LINE_PATTERN, (_match, prefix: string, line: string) => {
    return `${prefix}${dim(line)}`;
  });
}

function createPrettyStream() {
  const output = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, dimDetailLines(String(chunk)));
    },
  });

  output.pipe(process.stdout);
  return pretty({ ...getPrettyLoggerOptions(), destination: output });
}

export interface PayKitInternalLogger extends pino.Logger {
  trace: pino.Logger["trace"] & {
    run: <T>(prefix: string, fn: () => T | Promise<T>) => T | Promise<T>;
  };
}

export interface LoggerEnvironment {
  nodeEnv?: string;
}

export function getTraceId(): string | undefined {
  const bindings = storage.getStore()?.bindings();
  return bindings?.traceId as string | undefined;
}

export function shouldUsePrettyLogs(environment: LoggerEnvironment = {}): boolean {
  const { nodeEnv = process.env.NODE_ENV } = environment;
  return nodeEnv !== "production";
}

export function getDefaultLoggerOptions(
  logging: Pick<PayKitLoggingOptions, "level"> | undefined,
): pino.LoggerOptions {
  return {
    level: logging?.level ?? DEFAULT_LOG_LEVEL,
    name: "paykit",
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export function getPrettyLoggerOptions(): pretty.PrettyOptions {
  const ignore =
    process.env.PAYKIT_CLI === "1"
      ? `${PRETTY_LOG_IGNORE_FIELDS},name,traceId`
      : PRETTY_LOG_IGNORE_FIELDS;

  return {
    colorize: true,
    colorizeObjects: false,
    ignore,
    levelFirst: false,
    messageFormat: (log, messageKey) => plain(log[messageKey] ?? ""),
    translateTime: PRETTY_LOG_TIMESTAMP,
    customPrettifiers: {
      actionType: dim,
      duration: dim,
      event: dim,
      msg: (message) => String(message),
      providerEventId: dim,
      time: dim,
      traceId: dim,
    },
  };
}

export function createPayKitLogger(
  logging?: PayKitLoggingOptions,
  environment: LoggerEnvironment = {},
): PayKitInternalLogger {
  const base =
    logging?.logger ??
    (shouldUsePrettyLogs(environment)
      ? pino(getDefaultLoggerOptions(logging), createPrettyStream())
      : pino(getDefaultLoggerOptions(logging)));

  const handler: ProxyHandler<pino.Logger> = {
    get(target, prop, receiver) {
      // Intercept trace to add .run()
      if (prop === "trace") {
        const current = storage.getStore() ?? target;
        const traceFn = current.trace.bind(current);
        (traceFn as unknown as Record<string, unknown>).run = <T>(
          prefix: string,
          fn: () => T | Promise<T>,
        ): T | Promise<T> => {
          const child = current.child({ traceId: generateId(prefix, 12) });
          return storage.run(child, fn);
        };
        return traceFn;
      }

      const current = storage.getStore() ?? target;
      const value = Reflect.get(current, prop, receiver);
      if (typeof value === "function") {
        return value.bind(current);
      }
      return value;
    },
  };

  return new Proxy(base, handler) as PayKitInternalLogger;
}
