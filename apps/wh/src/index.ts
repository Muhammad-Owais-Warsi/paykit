import { and, asc, count, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { delivery, tunnel } from "./db/schema";

interface Bindings {
  DB: D1Database;
  MAX_BODY_BYTES: string;
  MAX_DELIVERIES_PER_TUNNEL: string;
  PAYKIT_WEBHOOK_API_BASE_URL?: string;
  RETENTION_DAYS: string;
}

const app = new Hono<{ Bindings: Bindings }>();
type AppContext = Context<{ Bindings: Bindings }>;

function getDb(env: Bindings) {
  return drizzle(env.DB);
}

function now(): number {
  return Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getNumericVar(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRequiredWebhookBaseUrl(env: Bindings): string {
  const baseUrl = env.PAYKIT_WEBHOOK_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("PAYKIT_WEBHOOK_API_BASE_URL is required");
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
    isNull(delivery.failedAt),
  ];

  if (params.retryWindowMs > 0 && typeof params.includeFailedBefore === "number") {
    conditions[2] = or(
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

app.get("/api/health", (c) => c.json({ ok: true }));

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

  await db
    .update(tunnel)
    .set({ providerWebhookEndpointId: body.providerWebhookEndpointId, updatedAt: now() })
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
    .set({ deliveredAt: now(), error: null, failedAt: null })
    .where(eq(delivery.id, currentDelivery.id));

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
    .set({ error: body.error ?? null, failedAt: now() })
    .where(eq(delivery.id, currentDelivery.id));

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

app.post("/:tunnelId", async (c) => {
  const db = getDb(c.env);
  const current = await db
    .select()
    .from(tunnel)
    .where(eq(tunnel.id, c.req.param("tunnelId")))
    .limit(1);
  const currentTunnel = current[0];

  if (!currentTunnel) {
    return c.text("Not found", 404);
  }

  if (currentTunnel.status !== "active") {
    return c.text("Tunnel disabled", 410);
  }

  const body = await c.req.text();
  const bodyBytes = new TextEncoder().encode(body).byteLength;
  if (bodyBytes > getNumericVar(c.env.MAX_BODY_BYTES, 262_144)) {
    return c.text("Payload too large", 413);
  }

  await db.insert(delivery).values({
    body,
    error: null,
    failedAt: null,
    headers: getRequestHeaders(c.req.raw),
    id: generateId("del"),
    method: c.req.method,
    receivedAt: now(),
    tunnelId: currentTunnel.id,
  });
  await pruneDeliveries({ db, env: c.env, tunnelId: currentTunnel.id });

  return c.json({ received: true });
});

export default app;
