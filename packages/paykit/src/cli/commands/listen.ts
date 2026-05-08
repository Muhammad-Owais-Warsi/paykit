import path from "node:path";

import { Command } from "commander";
import picocolors from "picocolors";

import type { PaymentProvider } from "../../providers/provider";
import { createDevLogger } from "../utils/dev-logger";
import { getOrCreateDeviceToken } from "../utils/device-token";
import { getPayKitConfig } from "../utils/get-config";
import { capture } from "../utils/telemetry";

const DEFAULT_CLOUD_BASE_URL = "https://wh.paykit.sh";
const DEFAULT_URL = "http://localhost:3000";
const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_RETRY_WINDOW = "5m";
const REPLAY_HEADER = "x-paykit-cloud-replay";

interface TunnelResponse {
  found: boolean;
  pendingCount: number;
  providerWebhookEndpointId: string | null;
  tunnelId: string;
  webhookUrl: string;
}

interface DeliveryResponse {
  body: string;
  headers: Record<string, string>;
  id: string;
  method: string;
  receivedAt: string;
}

interface TunnelCapableProvider extends PaymentProvider {
  disableTunnelWebhook(data: { endpointId: string }): Promise<void>;
  ensureTunnelWebhook(data: { existingEndpointId?: string | null; url: string }): Promise<{
    created: boolean;
    endpointId: string;
    webhookSecret?: string;
  }>;
  getTunnelAccount(): Promise<{
    displayName?: string;
    environment: string;
    providerAccountId: string;
    providerId: string;
  }>;
}

interface TunnelAccountSummary {
  displayName?: string;
  environment: string;
  providerAccountId: string;
  providerId: string;
}

interface ReplayResult {
  error?: string;
  ok: boolean;
  status?: number;
}

interface DeliveryDetails {
  eventId?: string;
  eventType?: string;
}

interface RelayRuntimeContext {
  account: TunnelAccountSummary;
  config: Awaited<ReturnType<typeof getPayKitConfig>>;
  deviceToken: string;
  provider: TunnelCapableProvider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryWindowMs(value: string): number {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "0" || trimmed === "none") {
    return 0;
  }

  const match = /^(\d+)(ms|s|m|h)?$/.exec(trimmed);
  if (!match) {
    throw new Error(`--retry must look like 0, none, 30s, 5m, or 1h. Received "${value}"`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "m";
  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 60 * 60_000;
    default:
      return amount * 60_000;
  }
}

function normalizeLocalOrigin(url: string): string {
  const parsed = new URL(url);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`--url must be an origin only, received "${url}"`);
  }

  return parsed.origin;
}

function buildLocalWebhookUrl(origin: string, basePath: string): string {
  return new URL(`${basePath}/webhook`, `${origin}/`).toString();
}

function formatEnvironment(environment: string): string {
  switch (environment) {
    case "test":
      return "sandbox";
    case "live":
      return "production";
    default:
      return environment;
  }
}

function parseDeliveryDetails(body: string): DeliveryDetails {
  try {
    const parsed = JSON.parse(body) as { id?: unknown; type?: unknown };
    return {
      eventId: typeof parsed.id === "string" ? parsed.id : undefined,
      eventType: typeof parsed.type === "string" ? parsed.type : undefined,
    };
  } catch {
    return {};
  }
}

function isMissingWebhookEndpointError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such webhook endpoint/i.test(message);
}

function printReadyBlock(
  devLogger: ReturnType<typeof createDevLogger>,
  params: {
    account: TunnelAccountSummary;
    localWebhookUrl: string;
    webhookSecret?: string;
    webhookUrl: string;
  },
) {
  const bullet = picocolors.cyan("•");
  const labelWidth = 16;
  const formatLabel = (label: string) => label + " ".repeat(labelWidth - label.length);
  const providerLabel = formatLabel("Stripe");
  const endpointLabel = formatLabel("Webhook endpoint");
  const secretLabel = formatLabel("Webhook secret");
  const accountName = params.account.displayName ?? params.account.providerAccountId;
  const accountSummary = `${accountName} ${picocolors.dim(`(${formatEnvironment(params.account.environment)})`)}`;
  const reminder = params.webhookSecret
    ? `\n${" ".repeat(2 + labelWidth + 1)}${picocolors.dim("^ don't forget add to .env")}`
    : "";

  devLogger.print(
    `Webhooks forwarding to ${picocolors.cyan(params.localWebhookUrl)}\n\n` +
      `${bullet} ${providerLabel} ${accountSummary}\n` +
      `${bullet} ${endpointLabel} ${params.webhookUrl}\n` +
      `${bullet} ${secretLabel} ${params.webhookSecret ?? picocolors.dim("(existing secret hidden)")}${reminder}\n` +
      `Ready!`,
  );
}

function printEnableSummary(
  devLogger: ReturnType<typeof createDevLogger>,
  params: {
    account: TunnelAccountSummary;
    webhookSecret?: string;
    webhookUrl: string;
  },
) {
  const bullet = picocolors.cyan("•");
  const labelWidth = 16;
  const formatLabel = (label: string) => label + " ".repeat(labelWidth - label.length);
  const providerLabel = formatLabel("Stripe");
  const endpointLabel = formatLabel("Webhook endpoint");
  const secretLabel = formatLabel("Webhook secret");
  const accountName = params.account.displayName ?? params.account.providerAccountId;
  const accountSummary = `${accountName} ${picocolors.dim(`(${formatEnvironment(params.account.environment)})`)}`;
  const reminder = params.webhookSecret
    ? `\n${" ".repeat(2 + labelWidth + 1)}${picocolors.dim("^ don't forget add to .env")}`
    : "";

  devLogger.print(
    `Webhook listener enabled.\n\n` +
      `${bullet} ${providerLabel} ${accountSummary}\n` +
      `${bullet} ${endpointLabel} ${params.webhookUrl}\n` +
      `${bullet} ${secretLabel} ${params.webhookSecret ?? picocolors.dim("(existing secret hidden)")}${reminder}\n\n` +
      `You're good to go.`,
  );
}

function printRetrySummary(
  devLogger: ReturnType<typeof createDevLogger>,
  params: {
    deliveryId: string;
    eventId?: string;
    eventType?: string;
  },
) {
  const label = params.eventType ?? "unknown";
  const id = params.eventId ?? params.deliveryId;
  devLogger.print(`Retried ${label} ${picocolors.dim(id)}.`);
}

function assertTunnelProvider(provider: PaymentProvider): TunnelCapableProvider {
  if (
    typeof provider.getTunnelAccount !== "function" ||
    typeof provider.ensureTunnelWebhook !== "function" ||
    typeof provider.disableTunnelWebhook !== "function"
  ) {
    throw new Error(`Provider "${provider.name}" does not support paykitjs listen yet.`);
  }

  return provider as TunnelCapableProvider;
}

function sanitizeReplayHeaders(headers: Record<string, string>): Headers {
  const nextHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "content-length" || lowerKey === "connection" || lowerKey === "host") {
      continue;
    }
    nextHeaders.set(key, value);
  }
  nextHeaders.set(REPLAY_HEADER, "1");
  return nextHeaders;
}

async function requestCloud<T>(
  deviceToken: string,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${deviceToken}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const cloudBaseUrl =
    process.env.PAYKIT_WEBHOOK_API_BASE_URL ??
    process.env.PAYKIT_CLOUD_URL ??
    DEFAULT_CLOUD_BASE_URL;

  const response = await fetch(`${cloudBaseUrl}${pathname}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const message = contentType.includes("text/html")
      ? `PayKit server request failed (${response.status} ${response.statusText})`
      : body || `PayKit server request failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function ensureTunnel(params: {
  account: TunnelAccountSummary;
  createIfMissing: boolean;
  deviceToken: string;
  includeFailedBefore?: number;
  retryWindowMs: number;
}): Promise<TunnelResponse | null> {
  const response = await requestCloud<TunnelResponse>(params.deviceToken, "/api/tunnels/ensure", {
    body: JSON.stringify({
      createIfMissing: params.createIfMissing,
      environment: params.account.environment,
      includeFailedBefore: params.includeFailedBefore,
      providerAccountId: params.account.providerAccountId,
      providerId: params.account.providerId,
      retryWindowMs: params.retryWindowMs,
    }),
    method: "POST",
  });

  return response.found ? response : null;
}

async function attachProviderWebhook(params: {
  deviceToken: string;
  endpointId: string;
  providerWebhookEndpointId: string;
}): Promise<void> {
  await requestCloud(params.deviceToken, `/api/tunnels/${params.endpointId}/provider-webhook`, {
    body: JSON.stringify({ providerWebhookEndpointId: params.providerWebhookEndpointId }),
    method: "POST",
  });
}

async function ackDelivery(params: { deliveryId: string; deviceToken: string }): Promise<void> {
  await requestCloud(params.deviceToken, `/api/deliveries/${params.deliveryId}/ack`, {
    method: "POST",
  });
}

async function pullDeliveries(params: {
  deviceToken: string;
  includeFailedBefore?: number;
  limit: number;
  offset?: number;
  retryWindowMs: number;
  tunnelId: string;
}): Promise<DeliveryResponse[]> {
  const search = new URLSearchParams({
    limit: String(params.limit),
    retryWindowMs: String(params.retryWindowMs),
  });
  if (typeof params.includeFailedBefore === "number") {
    search.set("includeFailedBefore", String(params.includeFailedBefore));
  }
  if (params.offset) {
    search.set("offset", String(params.offset));
  }

  const response = await requestCloud<{ deliveries: DeliveryResponse[] }>(
    params.deviceToken,
    `/api/tunnels/${params.tunnelId}/pull?${search.toString()}`,
  );
  return response.deliveries;
}

async function getDelivery(params: {
  deliveryId: string;
  deviceToken: string;
}): Promise<DeliveryResponse> {
  return requestCloud(params.deviceToken, `/api/deliveries/${params.deliveryId}`);
}

async function failDelivery(params: {
  deliveryId: string;
  deviceToken: string;
  error: string;
}): Promise<void> {
  await requestCloud(params.deviceToken, `/api/deliveries/${params.deliveryId}/fail`, {
    body: JSON.stringify({ error: params.error }),
    method: "POST",
  });
}

async function replayDelivery(params: {
  delivery: DeliveryResponse;
  localWebhookUrl: string;
}): Promise<ReplayResult> {
  try {
    const response = await fetch(params.localWebhookUrl, {
      body: params.delivery.body,
      headers: sanitizeReplayHeaders(params.delivery.headers),
      method: params.delivery.method,
    });

    return { ok: response.ok, status: response.status };
  } catch {
    return { error: "connection failed", ok: false };
  }
}

async function syncProviderWebhook(params: {
  deviceToken: string;
  provider: TunnelCapableProvider;
  tunnel: TunnelResponse;
}): Promise<{ webhookSecret?: string }> {
  const providerWebhook = await params.provider.ensureTunnelWebhook({
    existingEndpointId: params.tunnel.providerWebhookEndpointId,
    url: params.tunnel.webhookUrl,
  });

  if (providerWebhook.endpointId !== params.tunnel.providerWebhookEndpointId) {
    await attachProviderWebhook({
      deviceToken: params.deviceToken,
      endpointId: params.tunnel.tunnelId,
      providerWebhookEndpointId: providerWebhook.endpointId,
    });
  }

  return { webhookSecret: providerWebhook.webhookSecret };
}

async function processPendingDeliveries(params: {
  devLogger: ReturnType<typeof createDevLogger>;
  deliveries: DeliveryResponse[];
  deviceToken: string;
  localWebhookUrl: string;
  mode: "live" | "replay";
}): Promise<{
  hadDeliveries: boolean;
  processedCount: number;
}> {
  const deliveries = params.deliveries;

  if (deliveries.length === 0) {
    return { hadDeliveries: false, processedCount: 0 };
  }

  for (const delivery of deliveries) {
    const result = await replayDelivery({ delivery, localWebhookUrl: params.localWebhookUrl });
    const details = parseDeliveryDetails(delivery.body);
    const eventId = details.eventId ?? delivery.id;
    const eventType = details.eventType ?? "unknown";

    if (!result.ok) {
      const statusLabel = result.error ?? String(result.status ?? "failed");
      await failDelivery({
        deliveryId: delivery.id,
        deviceToken: params.deviceToken,
        error: statusLabel,
      });

      params.devLogger.event({
        eventId,
        eventType,
        replay: params.mode === "replay",
        status: statusLabel,
      });
      continue;
    }

    params.devLogger.event({
      eventId,
      eventType,
      replay: params.mode === "replay",
      status: result.status ?? 200,
    });

    await ackDelivery({ deliveryId: delivery.id, deviceToken: params.deviceToken });
  }

  return { hadDeliveries: true, processedCount: deliveries.length };
}

async function loadRelayRuntimeContext(params: {
  configPath?: string;
  cwd: string;
  devLogger: ReturnType<typeof createDevLogger>;
}): Promise<RelayRuntimeContext> {
  params.devLogger.start("Loading PayKit config");
  const config = await getPayKitConfig({ configPath: params.configPath, cwd: params.cwd });
  const provider = assertTunnelProvider(config.options.provider.createAdapter());
  const deviceToken = getOrCreateDeviceToken();

  params.devLogger.update("Connecting to Stripe");
  const account = await provider.getTunnelAccount();
  params.devLogger.update("Connecting to PayKit");

  return {
    account,
    config,
    deviceToken,
    provider,
  };
}

async function listenAction(options: {
  config?: string;
  cwd: string;
  retry: string;
  url: string;
}): Promise<void> {
  const cwd = path.resolve(options.cwd);
  capture("cli_command", { command: "listen" });
  const devLogger = createDevLogger();
  const localOrigin = normalizeLocalOrigin(options.url);
  const retryWindowMs = parseRetryWindowMs(options.retry);
  const relayStartedAt = Date.now();

  const { account, config, deviceToken, provider } = await loadRelayRuntimeContext({
    configPath: options.config,
    cwd,
    devLogger,
  });
  const tunnel = await ensureTunnel({
    account,
    createIfMissing: true,
    deviceToken,
    includeFailedBefore: relayStartedAt,
    retryWindowMs,
  });

  if (!tunnel) {
    devLogger.stop();
    throw new Error("Failed to create or load webhook tunnel.");
  }

  devLogger.update("Ensuring webhook endpoint");
  const { webhookSecret } = await syncProviderWebhook({ deviceToken, provider, tunnel });

  const localWebhookUrl = buildLocalWebhookUrl(localOrigin, config.options.basePath ?? "/paykit");
  devLogger.stop();
  printReadyBlock(devLogger, {
    account,
    localWebhookUrl,
    webhookSecret,
    webhookUrl: tunnel.webhookUrl,
  });

  if (tunnel.pendingCount > 0) {
    devLogger.info(
      `replaying ${String(tunnel.pendingCount)} missed webhook event${tunnel.pendingCount === 1 ? "" : "s"}`,
    );
  }

  let mode: "live" | "replay" = "replay";

  for (;;) {
    const deliveries = await pullDeliveries({
      deviceToken,
      includeFailedBefore: mode === "replay" ? relayStartedAt : undefined,
      limit: DEFAULT_BATCH_SIZE,
      retryWindowMs: mode === "replay" ? retryWindowMs : 0,
      tunnelId: tunnel.tunnelId,
    });

    const result = await processPendingDeliveries({
      devLogger,
      deliveries,
      deviceToken,
      localWebhookUrl,
      mode,
    });

    if (!result.hadDeliveries && mode === "replay") {
      devLogger.info("replay complete, listening for new webhooks");
      mode = "live";
      continue;
    }

    await sleep(result.processedCount > 0 ? 250 : DEFAULT_POLL_INTERVAL_MS);
  }
}

async function enableAction(options: { config?: string; cwd: string; url: string }): Promise<void> {
  const cwd = path.resolve(options.cwd);
  capture("cli_command", { command: "listen_enable" });
  const devLogger = createDevLogger();
  const localOrigin = normalizeLocalOrigin(options.url);

  const { account, config, deviceToken, provider } = await loadRelayRuntimeContext({
    configPath: options.config,
    cwd,
    devLogger,
  });
  const tunnel = await ensureTunnel({
    account,
    createIfMissing: true,
    deviceToken,
    retryWindowMs: 0,
  });

  if (!tunnel) {
    devLogger.stop();
    throw new Error("Failed to create or load webhook tunnel.");
  }

  devLogger.update("Ensuring webhook endpoint");
  const { webhookSecret } = await syncProviderWebhook({ deviceToken, provider, tunnel });

  const localWebhookUrl = buildLocalWebhookUrl(localOrigin, config.options.basePath ?? "/paykit");
  devLogger.stop();
  void localWebhookUrl;
  printEnableSummary(devLogger, {
    account,
    webhookSecret,
    webhookUrl: tunnel.webhookUrl,
  });
}

async function disableAction(options: { config?: string; cwd: string }): Promise<void> {
  const cwd = path.resolve(options.cwd);
  capture("cli_command", { command: "listen_disable" });
  const devLogger = createDevLogger();

  const { account, deviceToken, provider } = await loadRelayRuntimeContext({
    configPath: options.config,
    cwd,
    devLogger,
  });
  const tunnel = await ensureTunnel({
    account,
    createIfMissing: false,
    deviceToken,
    retryWindowMs: 0,
  });

  if (!tunnel) {
    devLogger.stop();
    devLogger.print("No webhook tunnel found for this provider account.");
    return;
  }

  if (tunnel.providerWebhookEndpointId) {
    try {
      await provider.disableTunnelWebhook({ endpointId: tunnel.providerWebhookEndpointId });
    } catch (error) {
      if (!isMissingWebhookEndpointError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        devLogger.warn(`Failed to delete provider webhook endpoint: ${message}`);
      }
    }
  }

  await requestCloud(deviceToken, `/api/tunnels/${tunnel.tunnelId}/disable`, { method: "POST" });
  devLogger.stop();
  devLogger.print(picocolors.green("Webhook tunnel disabled."));
}

async function retryAction(options: {
  config?: string;
  cwd: string;
  deliveryId: string;
  url: string;
}): Promise<void> {
  const cwd = path.resolve(options.cwd);
  capture("cli_command", { command: "listen_retry" });
  const devLogger = createDevLogger();
  const localOrigin = normalizeLocalOrigin(options.url);

  const { config, deviceToken } = await loadRelayRuntimeContext({
    configPath: options.config,
    cwd,
    devLogger,
  });
  const localWebhookUrl = buildLocalWebhookUrl(localOrigin, config.options.basePath ?? "/paykit");
  const delivery = await getDelivery({ deliveryId: options.deliveryId, deviceToken });
  devLogger.stop();

  const details = parseDeliveryDetails(delivery.body);
  const result = await replayDelivery({ delivery, localWebhookUrl });
  if (!result.ok) {
    const statusLabel = result.error ?? String(result.status ?? "failed");
    await failDelivery({ deliveryId: delivery.id, deviceToken, error: statusLabel });
    devLogger.event({
      eventId: details.eventId ?? delivery.id,
      eventType: details.eventType ?? "unknown",
      replay: true,
      status: statusLabel,
    });
    throw new Error(
      `Retry failed for ${details.eventType ?? "unknown"} ${details.eventId ?? delivery.id}.`,
    );
  }

  await ackDelivery({ deliveryId: delivery.id, deviceToken });
  devLogger.event({
    eventId: details.eventId ?? delivery.id,
    eventType: details.eventType ?? "unknown",
    replay: true,
    status: result.status ?? 200,
  });
  printRetrySummary(devLogger, {
    deliveryId: delivery.id,
    eventId: details.eventId,
    eventType: details.eventType,
  });
}

function mergeRelaySubcommandOptions<
  TOptions extends { config?: string; cwd?: string; retry?: string; url?: string },
>(
  options: TOptions,
  command: Command,
): { config?: string; cwd: string; retry?: string; url: string } {
  const parentOptions = command.parent?.opts() as
    | { config?: string; cwd?: string; retry?: string; url?: string }
    | undefined;

  return {
    config: options.config ?? parentOptions?.config,
    cwd: options.cwd ?? parentOptions?.cwd ?? process.cwd(),
    retry: options.retry ?? parentOptions?.retry,
    url: options.url ?? parentOptions?.url ?? DEFAULT_URL,
  };
}

export const listenCommand = new Command("listen")
  .description("Register a provider webhook tunnel, replay missed events, and keep polling")
  .option(
    "-c, --cwd <cwd>",
    "the working directory. defaults to the current directory.",
    process.cwd(),
  )
  .option("--config <config>", "the path to the PayKit configuration file to load.")
  .option(
    "--retry <window>",
    "retry failed deliveries received within this window",
    DEFAULT_RETRY_WINDOW,
  )
  .option("--url <url>", "local app origin", DEFAULT_URL)
  .action(listenAction)
  .addCommand(
    new Command("enable")
      .description("Ensure the webhook tunnel and provider webhook endpoint, then exit")
      .option(
        "-c, --cwd <cwd>",
        "the working directory. defaults to the current directory.",
        process.cwd(),
      )
      .option("--config <config>", "the path to the PayKit configuration file to load.")
      .option("--url <url>", "local app origin")
      .action((options, command) => enableAction(mergeRelaySubcommandOptions(options, command))),
  )
  .addCommand(
    new Command("retry")
      .description("Retry one stored delivery once, then exit")
      .argument("<deliveryId>", "stored delivery id")
      .option(
        "-c, --cwd <cwd>",
        "the working directory. defaults to the current directory.",
        process.cwd(),
      )
      .option("--config <config>", "the path to the PayKit configuration file to load.")
      .option("--url <url>", "local app origin")
      .action((deliveryId, options, command) =>
        retryAction({
          ...mergeRelaySubcommandOptions(options, command),
          deliveryId,
        }),
      ),
  )
  .addCommand(
    new Command("disable")
      .description("Disable the webhook tunnel for the current provider account")
      .option(
        "-c, --cwd <cwd>",
        "the working directory. defaults to the current directory.",
        process.cwd(),
      )
      .option("--config <config>", "the path to the PayKit configuration file to load.")
      .action((options, command) => disableAction(mergeRelaySubcommandOptions(options, command))),
  );
