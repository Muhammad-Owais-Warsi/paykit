CREATE TABLE `tunnel` (
  `id` text PRIMARY KEY NOT NULL,
  `device_token_hash` text NOT NULL,
  `provider_id` text NOT NULL,
  `environment` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `provider_webhook_endpoint_id` text,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL,
  `disabled_at` integer
);

CREATE UNIQUE INDEX `tunnel_device_provider_unique`
  ON `tunnel` (`device_token_hash`, `provider_id`, `environment`, `provider_account_id`);

CREATE INDEX `tunnel_device_idx` ON `tunnel` (`device_token_hash`);

CREATE TABLE `delivery` (
  `id` text PRIMARY KEY NOT NULL,
  `tunnel_id` text NOT NULL,
  `method` text NOT NULL,
  `headers` text NOT NULL,
  `body` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `received_at` integer NOT NULL,
  `delivered_at` integer,
  FOREIGN KEY (`tunnel_id`) REFERENCES `tunnel`(`id`) ON DELETE cascade
);

CREATE INDEX `delivery_tunnel_status_received_idx`
  ON `delivery` (`tunnel_id`, `status`, `received_at`);
