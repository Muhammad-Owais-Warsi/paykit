import { and, asc, count, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { delivery, tunnel } from "./db/schema";
import { TunnelObject, type TunnelObjectBindings } from "./tunnel-object";

interface Bindings extends TunnelObjectBindings {
  TUNNEL_OBJECT: DurableObjectNamespace<TunnelObject>;
}

const app = new Hono<{ Bindings: Bindings }>();
type AppContext = Context<{ Bindings: Bindings }>;
const MIN_CLI_VERSION = "0.0.4";

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function getDb(env: Bindings) {
  return drizzle(env.DB);
}

function now(): number {
  return Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);

    if (leftNumeric && rightNumeric) {
      const leftNumber = Number(leftPart);
      const rightNumber = Number(rightPart);
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }
      continue;
    }

    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);

  if (!leftVersion || !rightVersion) {
    return -1;
  }

  const leftParts = [leftVersion.major, leftVersion.minor, leftVersion.patch];
  const rightParts = [rightVersion.major, rightVersion.minor, rightVersion.patch];

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function getCliVersion(c: AppContext): string | undefined {
  return c.req.header("x-paykit-cli-version") ?? c.req.query("cliVersion");
}

function getCliVersionFromRequest(request: Request): string | undefined {
  return (
    request.headers.get("x-paykit-cli-version") ??
    new URL(request.url).searchParams.get("cliVersion") ??
    undefined
  );
}

function createCliUpgradeResponse(): Response {
  return Response.json(
    {
      code: "CLI_UPGRADE_REQUIRED",
      message: `This paykitjs CLI version is no longer supported. Upgrade paykitjs to ${MIN_CLI_VERSION} or newer.`,
      minVersion: MIN_CLI_VERSION,
    },
    { status: 426 },
  );
}

function isSupportedCliVersion(version: string | undefined): boolean {
  return typeof version === "string" && compareVersions(version, MIN_CLI_VERSION) >= 0;
}

function getNumericVar(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRequiredWebhookBaseUrl(env: Bindings): string {
  const baseUrl =
    env.PAYKIT_WEBHOOK_PUBLIC_BASE_URL?.trim() ?? env.PAYKIT_WEBHOOK_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("PAYKIT_WEBHOOK_PUBLIC_BASE_URL is required");
  }

  return baseUrl.replace(/\/$/, "");
}

function generateId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return `${prefix}_${suffix}`;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireDeviceTokenHash(c: AppContext) {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }

  return hashToken(token);
}

function getWebhookUrl(params: { env: Bindings; tunnelId: string }): string {
  const baseUrl = getRequiredWebhookBaseUrl(params.env);
  return `${baseUrl}/${params.tunnelId}`;
}

function getRequestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

async function getOwnedTunnel(params: {
  db: ReturnType<typeof getDb>;
  deviceTokenHash: string;
  tunnelId: string;
}) {
  const rows = await params.db
    .select()
    .from(tunnel)
    .where(and(eq(tunnel.id, params.tunnelId), eq(tunnel.deviceTokenHash, params.deviceTokenHash)))
    .limit(1);

  return rows[0] ?? null;
}

function readNumberParam(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readOptionalNumberParam(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function buildPullableDeliveryWhere(params: {
  includeFailedBefore?: number;
  retryWindowMs: number;
  tunnelId: string;
}) {
  const conditions = [
    eq(delivery.tunnelId, params.tunnelId),
    isNull(delivery.deliveredAt),
    isNull(delivery.sentAt),
    isNull(delivery.failedAt),
  ];

  if (params.retryWindowMs > 0 && typeof params.includeFailedBefore === "number") {
    conditions[3] = or(
      isNull(delivery.failedAt),
      and(
        lt(delivery.failedAt, params.includeFailedBefore),
        gte(delivery.receivedAt, now() - params.retryWindowMs),
      ),
    )!;
  }

  return and(...conditions);
}

async function getPullableCount(
  db: ReturnType<typeof getDb>,
  params: { includeFailedBefore?: number; retryWindowMs: number; tunnelId: string },
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(delivery)
    .where(buildPullableDeliveryWhere(params));
  return rows[0]?.count ?? 0;
}

function getTunnelStub(env: Bindings, tunnelId: string) {
  return env.TUNNEL_OBJECT.get(env.TUNNEL_OBJECT.idFromName(tunnelId));
}

async function notifyTunnelObject(env: Bindings, params: { tunnelId: string }): Promise<void> {
  const response = await getTunnelStub(env, params.tunnelId).fetch(
    new Request("https://internal/internal/push", { method: "POST" }),
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function pruneDeliveries(params: {
  db: ReturnType<typeof getDb>;
  env: Bindings;
  tunnelId: string;
}) {
  const retentionDays = getNumericVar(params.env.RETENTION_DAYS, 30);
  const maxDeliveries = getNumericVar(params.env.MAX_DELIVERIES_PER_TUNNEL, 5000);
  const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;

  await params.db
    .delete(delivery)
    .where(and(eq(delivery.tunnelId, params.tunnelId), lt(delivery.receivedAt, cutoff)));

  const rows = await params.db
    .select({ count: count() })
    .from(delivery)
    .where(eq(delivery.tunnelId, params.tunnelId));
  const overflow = (rows[0]?.count ?? 0) - maxDeliveries;

  if (overflow > 0) {
    await params.db.run(sql`
      delete from delivery
      where id in (
        select id from delivery
        where tunnel_id = ${params.tunnelId}
        order by received_at asc, id asc
        limit ${overflow}
      )
    `);
  }
}

async function requireSocketDeviceTokenHashFromRequest(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      return hashToken(token);
    }
  }

  const token = new URL(request.url).searchParams.get("deviceToken")?.trim();
  if (!token) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }

  return hashToken(token);
}

function getConnectTunnelId(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "tunnels" &&
    segments[3] === "connect"
  ) {
    return segments[2] ?? null;
  }

  return null;
}

async function maybeHandleTunnelSocketRequest(
  request: Request,
  env: Bindings,
): Promise<Response | null> {
  const tunnelId = getConnectTunnelId(new URL(request.url).pathname);
  if (!tunnelId || request.method !== "GET") {
    return null;
  }

  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected websocket upgrade", { status: 426 });
  }

  if (!isSupportedCliVersion(getCliVersionFromRequest(request))) {
    return createCliUpgradeResponse();
  }

  const deviceTokenHash = await requireSocketDeviceTokenHashFromRequest(request);
  const db = getDb(env);
  const current = await getOwnedTunnel({ db, deviceTokenHash, tunnelId });

  if (!current) {
    return new Response("Tunnel not found", { status: 404 });
  }

  if (current.status === "disabled") {
    return new Response("Tunnel disabled", { status: 410 });
  }

  return getTunnelStub(env, current.id).fetch(request);
}

async function maybeHandleProviderWebhookRequest(
  request: Request,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  if (request.method !== "POST" || segments.length !== 1) {
    return null;
  }

  const tunnelId = segments[0];
  if (!tunnelId) {
    return null;
  }

  const db = getDb(env);
  const current = await db.select().from(tunnel).where(eq(tunnel.id, tunnelId)).limit(1);
  const currentTunnel = current[0];

  if (!currentTunnel) {
    return new Response("Not found", { status: 404 });
  }

  if (currentTunnel.status !== "active") {
    return new Response("Tunnel disabled", { status: 410 });
  }

  const body = await request.text();
  const bodyBytes = new TextEncoder().encode(body).byteLength;
  if (bodyBytes > getNumericVar(env.MAX_BODY_BYTES, 262_144)) {
    return new Response("Payload too large", { status: 413 });
  }

  await db.insert(delivery).values({
    body,
    error: null,
    failedAt: null,
    headers: getRequestHeaders(request),
    id: generateId("del"),
    method: request.method,
    receivedAt: now(),
    sentAt: null,
    tunnelId: currentTunnel.id,
  });
  await pruneDeliveries({ db, env, tunnelId: currentTunnel.id });

  ctx.waitUntil(notifyTunnelObject(env, { tunnelId: currentTunnel.id }));

  return Response.json({ received: true });
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") {
    return next();
  }

  if (!isSupportedCliVersion(getCliVersion(c))) {
    return createCliUpgradeResponse();
  }

  return next();
});

app.post("/api/tunnels/ensure", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const body = (await c.req.json()) as {
    createIfMissing?: boolean;
    environment?: string;
    includeFailedBefore?: number;
    providerAccountId?: string;
    providerId?: string;
    retryWindowMs?: number;
  };

  if (!body.providerId || !body.providerAccountId || !body.environment) {
    return c.text("providerId, providerAccountId, and environment are required", 400);
  }

  const retryWindowMs = Math.max(0, readNumberParam(String(body.retryWindowMs ?? "0"), 0));
  const includeFailedBefore =
    typeof body.includeFailedBefore === "number" && !Number.isNaN(body.includeFailedBefore)
      ? body.includeFailedBefore
      : undefined;

  const createIfMissing = body.createIfMissing !== false;
  const existing = await db
    .select()
    .from(tunnel)
    .where(
      and(
        eq(tunnel.deviceTokenHash, deviceTokenHash),
        eq(tunnel.providerId, body.providerId),
        eq(tunnel.environment, body.environment),
        eq(tunnel.providerAccountId, body.providerAccountId),
      ),
    )
    .limit(1);

  const current = existing[0];
  if (!current) {
    if (!createIfMissing) {
      return c.json({ found: false });
    }

    const tunnelId = generateId("ep");
    const timestamp = now();
    await db.insert(tunnel).values({
      createdAt: timestamp,
      deviceTokenHash,
      environment: body.environment,
      id: tunnelId,
      lastSeenAt: timestamp,
      providerAccountId: body.providerAccountId,
      providerId: body.providerId,
      status: "active",
      updatedAt: timestamp,
    });

    return c.json({
      found: true,
      pendingCount: 0,
      providerWebhookEndpointId: null,
      tunnelId,
      webhookUrl: getWebhookUrl({ env: c.env, tunnelId }),
    });
  }

  const timestamp = now();
  await db
    .update(tunnel)
    .set({
      disabledAt: createIfMissing ? null : current.disabledAt,
      lastSeenAt: timestamp,
      status: createIfMissing ? "active" : current.status,
      updatedAt: timestamp,
    })
    .where(eq(tunnel.id, current.id));

  return c.json({
    found: true,
    pendingCount: await getPullableCount(db, {
      includeFailedBefore,
      retryWindowMs,
      tunnelId: current.id,
    }),
    providerWebhookEndpointId: current.providerWebhookEndpointId,
    tunnelId: current.id,
    webhookUrl: getWebhookUrl({ env: c.env, tunnelId: current.id }),
  });
});

app.get("/api/tunnels/:tunnelId/welcome", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const current = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: c.req.param("tunnelId"),
  });

  if (!current) {
    return c.text("Tunnel not found", 404);
  }

  if (current.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  const retryWindowMs = Math.max(0, readNumberParam(c.req.query("retryWindowMs"), 0));
  const includeFailedBefore = readOptionalNumberParam(c.req.query("includeFailedBefore"));

  return c.json({
    pendingCount: await getPullableCount(db, {
      includeFailedBefore,
      retryWindowMs,
      tunnelId: current.id,
    }),
    tunnelId: current.id,
  });
});

app.post("/api/tunnels/:tunnelId/provider-webhook", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const current = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: c.req.param("tunnelId"),
  });

  if (!current) {
    return c.text("Tunnel not found", 404);
  }

  if (current.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  const body = (await c.req.json()) as { providerWebhookEndpointId?: string };
  if (!body.providerWebhookEndpointId) {
    return c.text("providerWebhookEndpointId is required", 400);
  }

  const timestamp = now();
  await db
    .update(tunnel)
    .set({ providerWebhookEndpointId: body.providerWebhookEndpointId, updatedAt: timestamp })
    .where(eq(tunnel.id, current.id));

  return c.json({ ok: true });
});

app.get("/api/tunnels/:tunnelId/pull", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const current = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: c.req.param("tunnelId"),
  });

  if (!current) {
    return c.text("Tunnel not found", 404);
  }

  if (current.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  const limit = clamp(readNumberParam(c.req.query("limit"), 30), 1, 100);
  const offset = clamp(readNumberParam(c.req.query("offset"), 0), 0, 10_000);
  const retryWindowMs = Math.max(0, readNumberParam(c.req.query("retryWindowMs"), 0));
  const includeFailedBefore = readOptionalNumberParam(c.req.query("includeFailedBefore"));
  const deliveries = await db
    .select()
    .from(delivery)
    .where(
      buildPullableDeliveryWhere({
        includeFailedBefore,
        retryWindowMs,
        tunnelId: current.id,
      }),
    )
    .orderBy(asc(delivery.receivedAt), asc(delivery.id))
    .limit(limit)
    .offset(offset);

  return c.json({
    deliveries: deliveries.map((item) => ({
      body: item.body,
      headers: item.headers,
      id: item.id,
      method: item.method,
      receivedAt: new Date(item.receivedAt).toISOString(),
    })),
  });
});

app.get("/api/deliveries/:deliveryId", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(delivery)
    .where(eq(delivery.id, c.req.param("deliveryId")))
    .limit(1);
  const currentDelivery = rows[0];

  if (!currentDelivery) {
    return c.text("Delivery not found", 404);
  }

  const currentTunnel = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: currentDelivery.tunnelId,
  });
  if (!currentTunnel) {
    return c.text("Delivery not found", 404);
  }

  if (currentTunnel.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  return c.json({
    body: currentDelivery.body,
    deliveredAt: currentDelivery.deliveredAt,
    failedAt: currentDelivery.failedAt,
    headers: currentDelivery.headers,
    id: currentDelivery.id,
    method: currentDelivery.method,
    receivedAt: new Date(currentDelivery.receivedAt).toISOString(),
  });
});

app.post("/api/deliveries/:deliveryId/ack", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const rows = await db
    .select({ id: delivery.id, tunnelId: delivery.tunnelId })
    .from(delivery)
    .where(eq(delivery.id, c.req.param("deliveryId")))
    .limit(1);

  const currentDelivery = rows[0];
  if (!currentDelivery) {
    return c.text("Delivery not found", 404);
  }

  const currentTunnel = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: currentDelivery.tunnelId,
  });
  if (!currentTunnel) {
    return c.text("Delivery not found", 404);
  }

  if (currentTunnel.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  await db
    .update(delivery)
    .set({ deliveredAt: now(), error: null, failedAt: null, sentAt: null })
    .where(eq(delivery.id, currentDelivery.id));

  await notifyTunnelObject(c.env, { tunnelId: currentTunnel.id });

  return c.json({ ok: true });
});

app.post("/api/deliveries/:deliveryId/fail", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(delivery)
    .where(eq(delivery.id, c.req.param("deliveryId")))
    .limit(1);
  const currentDelivery = rows[0];

  if (!currentDelivery) {
    return c.text("Delivery not found", 404);
  }

  const currentTunnel = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: currentDelivery.tunnelId,
  });
  if (!currentTunnel) {
    return c.text("Delivery not found", 404);
  }

  if (currentTunnel.status === "disabled") {
    return c.text("Tunnel disabled", 410);
  }

  const body = (await c.req.json()) as { error?: string };
  await db
    .update(delivery)
    .set({ error: body.error ?? null, failedAt: now(), sentAt: null })
    .where(eq(delivery.id, currentDelivery.id));

  await notifyTunnelObject(c.env, { tunnelId: currentTunnel.id });

  return c.json({ ok: true });
});

app.post("/api/tunnels/:tunnelId/disable", async (c) => {
  const deviceTokenHash = await requireDeviceTokenHash(c);
  const db = getDb(c.env);
  const current = await getOwnedTunnel({
    db,
    deviceTokenHash,
    tunnelId: c.req.param("tunnelId"),
  });

  if (!current) {
    return c.text("Tunnel not found", 404);
  }

  const timestamp = now();
  await db
    .update(tunnel)
    .set({ disabledAt: timestamp, status: "disabled", updatedAt: timestamp })
    .where(eq(tunnel.id, current.id));

  return c.json({ ok: true });
});

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const socketResponse = await maybeHandleTunnelSocketRequest(request, env);
    if (socketResponse) {
      return socketResponse;
    }

    const providerWebhookResponse = await maybeHandleProviderWebhookRequest(request, env, ctx);
    if (providerWebhookResponse) {
      return providerWebhookResponse;
    }

    return app.fetch(request, env, ctx);
  },
};
export { TunnelObject };
