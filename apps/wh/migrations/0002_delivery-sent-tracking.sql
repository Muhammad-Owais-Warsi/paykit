DROP INDEX `delivery_tunnel_delivery_idx`;--> statement-breakpoint
ALTER TABLE `delivery` ADD `sent_at` integer;--> statement-breakpoint
CREATE INDEX `delivery_tunnel_delivery_idx` ON `delivery` (`tunnel_id`,`delivered_at`,`sent_at`,`failed_at`,`received_at`);