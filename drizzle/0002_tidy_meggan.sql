CREATE TABLE `quote_request_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quoteRequestId` int NOT NULL,
	`type` enum('created','status_changed','assigned','note_added','quote_created') NOT NULL,
	`actorUserId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_request_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `source` enum('public_link','manual','whatsapp','instagram','other') DEFAULT 'public_link' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_request_events` ADD CONSTRAINT `quote_request_events_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_request_events` ADD CONSTRAINT `quote_request_events_quoteRequestId_quote_requests_id_fk` FOREIGN KEY (`quoteRequestId`) REFERENCES `quote_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_request_events` ADD CONSTRAINT `quote_request_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `quote_request_events_tenant_request_idx` ON `quote_request_events` (`tenantId`,`quoteRequestId`);