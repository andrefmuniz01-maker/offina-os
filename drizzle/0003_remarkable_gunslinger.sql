CREATE TABLE `work_order_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`workOrderId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_order_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_order_notes` ADD CONSTRAINT `work_order_notes_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_notes` ADD CONSTRAINT `work_order_notes_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_notes` ADD CONSTRAINT `work_order_notes_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_order_notes_tenant_order_idx` ON `work_order_notes` (`tenantId`,`workOrderId`);