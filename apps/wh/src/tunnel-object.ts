import { DurableObject } from "cloudflare:workers";
import { and, asc, count, eq, gte, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { delivery, tunnel } from "./db/schema";

export interface TunnelObjectBindings {
  DB: D1Database;
  MAX_BODY_BYTES: string;
  MAX_DELIVERIES_PER_TUNNEL: string;
  PAYKIT_WEBHOOK_API_BASE_URL?: string;
  PAYKIT_WEBHOOK_PUBLIC_BASE_URL?: string;
  RETENTION_DAYS: string;
}

interface SocketAttachment {
  deviceTokenHash: string;
  includeFailedBefore?: number;
  replayCompleteSent: boolean;
  retryWindowMs: number;
  role: "cli";
  tunnelId: string;
}

function now(): number {
  return Date.now();
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readNumberParam(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readOptionalNumberParam(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function readDeviceToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const token = new URL(request.url).searchParams.get("deviceToken")?.trim();
  return token ? token : null;
}

function buildDeliverableWhere(params: {
  includeFailedBefore?: number;
  retryWindowMs: number;
  tunnelId: string;
}): SQL | undefined {
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

export class TunnelObject extends DurableObject<TunnelObjectBindings> {
  private db: ReturnType<typeof drizzle>;

  constructor(ctx: DurableObjectState, env: TunnelObjectBindings) {
    super(ctx, env);
    this.db = drizzle(env.DB);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/push" && request.method === "POST") {
      await this.pushToConnectedClient();
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleSocketConnect(request);
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const attachment = this.readSocketAttachment(ws);
    if (!attachment) {
      ws.close(1008, "invalid socket state");
      return;
    }

    if (typeof message !== "string") {
      ws.close(1003, "expected text message");
      return;
    }

    let parsed: { deliveryId?: string; error?: string; type?: string };
    try {
      parsed = JSON.parse(message) as { deliveryId?: string; error?: string; type?: string };
    } catch {
      ws.close(1003, "invalid message");
      return;
    }

    switch (parsed.type) {
      case "ack":
        if (!parsed.deliveryId) {
          ws.close(1008, "deliveryId is required");
          return;
        }
        await this.ackDelivery({ deliveryId: parsed.deliveryId, tunnelId: attachment.tunnelId });
        await this.sendNextDelivery(ws);
        return;
      case "fail":
        if (!parsed.deliveryId) {
          ws.close(1008, "deliveryId is required");
          return;
        }
        await this.failDelivery({
          deliveryId: parsed.deliveryId,
          error: parsed.error ?? "failed",
          tunnelId: attachment.tunnelId,
        });
        await this.sendNextDelivery(ws);
        return;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      default:
        ws.close(1003, "unsupported message");
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = this.readSocketAttachment(ws);
    if (!attachment) {
      return;
    }

    await this.resetInFlightDeliveries(attachment.tunnelId);
  }

  private async handleSocketConnect(request: Request): Promise<Response> {
    const tunnelId = this.extractTunnelIdFromConnectPath(request.url);
    if (!tunnelId) {
      return new Response("Tunnel not found", { status: 404 });
    }

    const token = readDeviceToken(request);
    if (!token) {
      return new Response("Missing bearer token", { status: 401 });
    }

    const deviceTokenHash = await hashToken(token);
    const rows = await this.db
      .select()
      .from(tunnel)
      .where(and(eq(tunnel.id, tunnelId), eq(tunnel.deviceTokenHash, deviceTokenHash)))
      .limit(1);
    const currentTunnel = rows[0];

    if (!currentTunnel) {
      return new Response("Tunnel not found", { status: 404 });
    }

    if (currentTunnel.status !== "active") {
      return new Response("Tunnel disabled", { status: 410 });
    }

    const url = new URL(request.url);
    const retryWindowMs = Math.max(0, readNumberParam(url.searchParams.get("retryWindowMs"), 0));
    const includeFailedBefore = readOptionalNumberParam(
      url.searchParams.get("includeFailedBefore"),
    );

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    await this.resetInFlightDeliveries(tunnelId);
    this.closeClientSockets("replaced by a newer session");
    this.ctx.acceptWebSocket(server, ["cli"]);
    server.serializeAttachment({
      deviceTokenHash,
      includeFailedBefore,
      replayCompleteSent: false,
      retryWindowMs,
      role: "cli",
      tunnelId,
    } satisfies SocketAttachment);

    server.send(
      JSON.stringify({
        pendingCount: await this.countDeliverableDeliveries({
          includeFailedBefore,
          retryWindowMs,
          tunnelId,
        }),
        tunnelId,
        type: "hello",
      }),
    );
    await this.sendNextDelivery(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private readSocketAttachment(ws: WebSocket): SocketAttachment | null {
    const attachment = ws.deserializeAttachment();
    if (!attachment || typeof attachment !== "object") {
      return null;
    }

    const socketAttachment = attachment as Partial<SocketAttachment>;
    if (socketAttachment.role !== "cli" || typeof socketAttachment.tunnelId !== "string") {
      return null;
    }

    return {
      deviceTokenHash: socketAttachment.deviceTokenHash ?? "",
      includeFailedBefore: socketAttachment.includeFailedBefore,
      replayCompleteSent: socketAttachment.replayCompleteSent ?? false,
      retryWindowMs: socketAttachment.retryWindowMs ?? 0,
      role: "cli",
      tunnelId: socketAttachment.tunnelId,
    };
  }

  private async countDeliverableDeliveries(params: {
    includeFailedBefore?: number;
    retryWindowMs: number;
    tunnelId: string;
  }): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(delivery)
      .where(buildDeliverableWhere(params));
    return rows[0]?.count ?? 0;
  }

  private async hasInFlightDelivery(tunnelId: string): Promise<boolean> {
    const rows = await this.db
      .select({ count: count() })
      .from(delivery)
      .where(
        and(
          eq(delivery.tunnelId, tunnelId),
          isNull(delivery.deliveredAt),
          isNull(delivery.failedAt),
          isNotNull(delivery.sentAt),
        ),
      );
    return (rows[0]?.count ?? 0) > 0;
  }

  private async sendNextDelivery(ws: WebSocket): Promise<void> {
    const attachment = this.readSocketAttachment(ws);
    if (!attachment) {
      return;
    }

    if (await this.hasInFlightDelivery(attachment.tunnelId)) {
      return;
    }

    const rows = await this.db
      .select()
      .from(delivery)
      .where(
        buildDeliverableWhere({
          includeFailedBefore: attachment.includeFailedBefore,
          retryWindowMs: attachment.retryWindowMs,
          tunnelId: attachment.tunnelId,
        }),
      )
      .orderBy(asc(delivery.receivedAt), asc(delivery.id))
      .limit(1);
    const nextDelivery = rows[0];

    if (!nextDelivery) {
      if (!attachment.replayCompleteSent) {
        attachment.replayCompleteSent = true;
        ws.serializeAttachment(attachment);
        ws.send(JSON.stringify({ type: "replay_complete" }));
      }
      return;
    }

    await this.db
      .update(delivery)
      .set({ sentAt: now() })
      .where(
        and(
          eq(delivery.id, nextDelivery.id),
          eq(delivery.tunnelId, attachment.tunnelId),
          isNull(delivery.deliveredAt),
          isNull(delivery.sentAt),
        ),
      );

    try {
      ws.send(
        JSON.stringify({
          delivery: {
            body: nextDelivery.body,
            headers: nextDelivery.headers,
            id: nextDelivery.id,
            method: nextDelivery.method,
            receivedAt: new Date(nextDelivery.receivedAt).toISOString(),
          },
          type: "delivery",
        }),
      );
    } catch (error) {
      await this.db.update(delivery).set({ sentAt: null }).where(eq(delivery.id, nextDelivery.id));
      throw new Error("Failed to send delivery", { cause: error });
    }
  }

  private async pushToConnectedClient(): Promise<void> {
    const ws = this.ctx.getWebSockets("cli")[0];
    if (!ws) {
      return;
    }

    await this.sendNextDelivery(ws);
  }

  private async ackDelivery(params: { deliveryId: string; tunnelId: string }): Promise<void> {
    await this.db
      .update(delivery)
      .set({ deliveredAt: now(), error: null, failedAt: null, sentAt: null })
      .where(and(eq(delivery.id, params.deliveryId), eq(delivery.tunnelId, params.tunnelId)));
  }

  private async failDelivery(params: {
    deliveryId: string;
    error: string;
    tunnelId: string;
  }): Promise<void> {
    await this.db
      .update(delivery)
      .set({ error: params.error, failedAt: now(), sentAt: null })
      .where(and(eq(delivery.id, params.deliveryId), eq(delivery.tunnelId, params.tunnelId)));
  }

  private async resetInFlightDeliveries(tunnelId: string): Promise<void> {
    await this.db
      .update(delivery)
      .set({ sentAt: null })
      .where(
        and(
          eq(delivery.tunnelId, tunnelId),
          isNull(delivery.deliveredAt),
          isNull(delivery.failedAt),
        ),
      );
  }

  private closeClientSockets(reason: string): void {
    for (const socket of this.ctx.getWebSockets("cli")) {
      socket.close(1012, reason);
    }
  }

  private extractTunnelIdFromConnectPath(urlValue: string): string | null {
    const segments = new URL(urlValue).pathname.split("/").filter(Boolean);
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
}
