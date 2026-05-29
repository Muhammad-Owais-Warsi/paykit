import { Writable } from "node:stream";

import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPayKitLogger,
  getDefaultLoggerOptions,
  getPrettyLoggerOptions,
  getTraceId,
  shouldUsePrettyLogs,
} from "../logger";

function createWritableBuffer() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });

  return {
    read() {
      return chunks
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    stream,
  };
}

async function flushLogger(logger: pino.Logger): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    logger.flush((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("core/logger", () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.PAYKIT_CLI;
  });

  it("enables pretty logs for all non-production environments", () => {
    expect(shouldUsePrettyLogs({ nodeEnv: "development" })).toBe(true);
    expect(shouldUsePrettyLogs({ nodeEnv: "production" })).toBe(false);
    expect(shouldUsePrettyLogs({ nodeEnv: "test" })).toBe(true);
  });

  it("builds the default logger with info level and pretty transport in local development", () => {
    const options = getDefaultLoggerOptions(undefined);

    expect(options.level).toBe("info");
    expect(options.name).toBe("paykit");
    expect(options.timestamp).toBeTypeOf("function");
    expect(getPrettyLoggerOptions()).toEqual({
      colorize: true,
      colorizeObjects: false,
      customPrettifiers: {
        actionType: expect.any(Function),
        duration: expect.any(Function),
        event: expect.any(Function),
        msg: expect.any(Function),
        providerEventId: expect.any(Function),
        time: expect.any(Function),
        traceId: expect.any(Function),
      },
      ignore: "pid,hostname",
      levelFirst: false,
      messageFormat: expect.any(Function),
      translateTime: "SYS:HH:MM:ss",
    });
  });

  it("hides the logger name in CLI pretty logs", () => {
    process.env.PAYKIT_CLI = "1";

    expect(getPrettyLoggerOptions()).toEqual({
      colorize: true,
      colorizeObjects: false,
      customPrettifiers: {
        actionType: expect.any(Function),
        duration: expect.any(Function),
        event: expect.any(Function),
        msg: expect.any(Function),
        providerEventId: expect.any(Function),
        time: expect.any(Function),
        traceId: expect.any(Function),
      },
      ignore: "pid,hostname,name,traceId",
      levelFirst: false,
      messageFormat: expect.any(Function),
      translateTime: "SYS:HH:MM:ss",
    });
  });

  it("builds the default logger without transport-specific options", () => {
    const options = getDefaultLoggerOptions({ level: "warn" });

    expect(options.level).toBe("warn");
    expect("transport" in options).toBe(false);
  });

  it("treats a provided logger as authoritative", async () => {
    const { read, stream } = createWritableBuffer();
    const baseLogger = pino({ level: "error", name: "custom" }, stream);
    const logger = createPayKitLogger({
      level: "info",
      logger: baseLogger,
    });

    logger.info("ignored");
    logger.error("kept");
    await flushLogger(logger);

    expect(read()).toEqual([
      expect.objectContaining({
        level: 50,
        msg: "kept",
        name: "custom",
      }),
    ]);
  });

  it("propagates trace ids through trace.run", async () => {
    const { read, stream } = createWritableBuffer();
    const logger = createPayKitLogger({
      logger: pino({ level: "info", name: "paykit-test" }, stream),
    });

    expect(getTraceId()).toBeUndefined();

    await logger.trace.run("sub", async () => {
      const traceId = getTraceId();

      expect(traceId).toMatch(/^sub_[0-9A-Za-z]{12}$/u);
      logger.info({ scope: "inside" }, "inside trace");
    });

    logger.info({ scope: "outside" }, "outside trace");
    await flushLogger(logger);

    expect(read()).toEqual([
      expect.objectContaining({
        msg: "inside trace",
        scope: "inside",
        traceId: expect.stringMatching(/^sub_[0-9A-Za-z]{12}$/u),
      }),
      expect.objectContaining({
        msg: "outside trace",
        scope: "outside",
      }),
    ]);
    expect(read()[1]?.traceId).toBeUndefined();
    expect(getTraceId()).toBeUndefined();
  });
});
