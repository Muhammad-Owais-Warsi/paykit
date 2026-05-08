DROP INDEX `delivery_tunnel_status_received_idx`;--> statement-breakpoint
ALTER TABLE `delivery` ADD `failed_at` integer;--> statement-breakpoint
ALTER TABLE `delivery` ADD `error` text;--> statement-breakpoint
CREATE INDEX `delivery_tunnel_delivery_idx` ON `delivery` (`tunnel_id`,`delivered_at`,`failed_at`,`received_at`);--> statement-breakpoint
ALTER TABLE `delivery` DROP COLUMN `status`;
