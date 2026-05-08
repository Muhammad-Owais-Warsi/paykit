import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tunnel = sqliteTable(
  "tunnel",
  {
    id: text("id").primaryKey(),
    deviceTokenHash: text("device_token_hash").notNull(),
    providerId: text("provider_id").notNull(),
    environment: text("environment").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerWebhookEndpointId: text("provider_webhook_endpoint_id"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "number" }).notNull(),
    disabledAt: integer("disabled_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("tunnel_device_provider_unique").on(
      table.deviceTokenHash,
      table.providerId,
      table.environment,
      table.providerAccountId,
    ),
    index("tunnel_device_idx").on(table.deviceTokenHash),
  ],
);

export const delivery = sqliteTable(
  "delivery",
  {
    id: text("id").primaryKey(),
    tunnelId: text("tunnel_id")
      .notNull()
      .references(() => tunnel.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    headers: text("headers", { mode: "json" }).$type<Record<string, string>>().notNull(),
    body: text("body").notNull(),
    receivedAt: integer("received_at", { mode: "number" }).notNull(),
    deliveredAt: integer("delivered_at", { mode: "number" }),
    failedAt: integer("failed_at", { mode: "number" }),
    error: text("error"),
  },
  (table) => [
    index("delivery_tunnel_delivery_idx").on(
      table.tunnelId,
      table.deliveredAt,
      table.failedAt,
      table.receivedAt,
    ),
  ],
);

export const tunnelRelations = relations(tunnel, ({ many }) => ({
  deliveries: many(delivery),
}));

export const deliveryRelations = relations(delivery, ({ one }) => ({
  tunnel: one(tunnel, {
    fields: [delivery.tunnelId],
    references: [tunnel.id],
  }),
}));
