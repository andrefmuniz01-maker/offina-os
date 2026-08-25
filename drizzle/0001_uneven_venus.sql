CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quoteId` int,
	`customerId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`workOrderId` int,
	`assignedToUserId` int,
	`bay` varchar(80),
	`scheduledStart` timestamp NOT NULL,
	`scheduledEnd` timestamp NOT NULL,
	`status` enum('scheduled','confirmed','received','diagnosis','awaiting_approval','awaiting_part','in_service','completed','delivered','cancelled') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quoteRequestId` int,
	`quoteId` int,
	`workOrderId` int,
	`storageKey` varchar(500) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`actorUserId` int,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(96) NOT NULL,
	`entityId` int,
	`before` json,
	`after` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`whatsapp` varchar(32) NOT NULL,
	`email` varchar(320),
	`document` varchar(32),
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`category` varchar(96) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`status` enum('planned','paid','cancelled') NOT NULL DEFAULT 'planned',
	`expenseDate` timestamp NOT NULL,
	`dueAt` timestamp,
	`recurrence` varchar(32),
	`supplierId` int,
	`notes` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`productId` int NOT NULL,
	`physicalQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`reservedQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_balances_tenant_product_unique` UNIQUE(`tenantId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`productId` int NOT NULL,
	`type` enum('purchase_entry','reservation','reservation_release','consumption','adjustment','return') NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`physicalDelta` decimal(12,3) NOT NULL DEFAULT '0',
	`reservedDelta` decimal(12,3) NOT NULL DEFAULT '0',
	`referenceType` varchar(64),
	`referenceId` int,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`productId` int NOT NULL,
	`quoteId` int,
	`workOrderId` int,
	`quantity` decimal(12,3) NOT NULL,
	`status` enum('active','consumed','released') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	CONSTRAINT `inventory_reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kit_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`kitId` int NOT NULL,
	`productId` int,
	`serviceId` int,
	`quantity` decimal(12,3) NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kit_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`categoryId` int,
	`name` varchar(180) NOT NULL,
	`description` text,
	`salePriceOverride` decimal(12,2),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`inAppEnabled` boolean NOT NULL DEFAULT true,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`enabledTypes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_tenant_user_unique` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int,
	`type` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`link` varchar(500),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`maxUsers` int NOT NULL DEFAULT 3,
	`maxCustomers` int,
	`features` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_categories_tenant_name_unique` UNIQUE(`tenantId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`categoryId` int,
	`supplierId` int,
	`name` varchar(180) NOT NULL,
	`sku` varchar(96),
	`brand` varchar(100),
	`unit` varchar(16) NOT NULL DEFAULT 'un',
	`currentCost` decimal(12,2) NOT NULL DEFAULT '0',
	`averageCost` decimal(12,2) NOT NULL DEFAULT '0',
	`salePrice` decimal(12,2) NOT NULL DEFAULT '0',
	`desiredMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`minStock` decimal(12,3) NOT NULL DEFAULT '0',
	`maxStock` decimal(12,3),
	`location` varchar(120),
	`barcode` varchar(96),
	`imageUrl` text,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_tenant_sku_unique` UNIQUE(`tenantId`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`orderedQuantity` decimal(12,3) NOT NULL,
	`receivedQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`unitCost` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`number` int NOT NULL,
	`supplierId` int,
	`status` enum('draft','ordered','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
	`orderedAt` timestamp,
	`receivedAt` timestamp,
	`notes` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_tenant_number_unique` UNIQUE(`tenantId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `quote_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quoteId` int NOT NULL,
	`type` enum('created','sent','viewed','approved','rejected','expired','cancelled','message_prepared') NOT NULL,
	`actorUserId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`quoteId` int NOT NULL,
	`productId` int,
	`serviceId` int,
	`kitId` int,
	`itemType` enum('product','service','kit','custom') NOT NULL,
	`description` varchar(255) NOT NULL,
	`quantity` decimal(12,3) NOT NULL DEFAULT '1',
	`unitPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`unitCost` decimal(12,2) NOT NULL DEFAULT '0',
	`discount` decimal(12,2) NOT NULL DEFAULT '0',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quote_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`number` int NOT NULL,
	`customerId` int,
	`vehicleId` int,
	`serviceId` int,
	`requesterName` varchar(180) NOT NULL,
	`requesterWhatsapp` varchar(32) NOT NULL,
	`requesterEmail` varchar(320),
	`vehicleSnapshot` json,
	`serviceLabel` varchar(180) NOT NULL,
	`answers` json,
	`description` text,
	`status` enum('new','in_analysis','awaiting_information','in_quoting','ready','sent','approved','rejected','expired','cancelled') NOT NULL DEFAULT 'new',
	`assignedToUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quote_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_requests_tenant_number_unique` UNIQUE(`tenantId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`number` int NOT NULL,
	`quoteRequestId` int,
	`customerId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`status` enum('draft','ready','sent','viewed','approved','rejected','expired','cancelled') NOT NULL DEFAULT 'draft',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`discountTotal` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`estimatedCostTotal` decimal(12,2) NOT NULL DEFAULT '0',
	`estimatedMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`validUntil` timestamp NOT NULL,
	`publicToken` varchar(96) NOT NULL,
	`publicTokenExpiresAt` timestamp NOT NULL,
	`notes` text,
	`terms` text,
	`createdByUserId` int NOT NULL,
	`sentAt` timestamp,
	`viewedAt` timestamp,
	`approvedAt` timestamp,
	`rejectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_tenant_number_unique` UNIQUE(`tenantId`,`number`),
	CONSTRAINT `quotes_public_token_unique` UNIQUE(`publicToken`)
);
--> statement-breakpoint
CREATE TABLE `revenues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`workOrderId` int,
	`customerId` int,
	`vehicleId` int,
	`amount` decimal(12,2) NOT NULL,
	`paymentMethod` varchar(64),
	`status` enum('expected','received','cancelled') NOT NULL DEFAULT 'expected',
	`dueAt` timestamp,
	`receivedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `revenues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`key` varchar(96) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(64),
	`active` boolean NOT NULL DEFAULT false,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_tasks_tenant_key_unique` UNIQUE(`tenantId`,`key`)
);
--> statement-breakpoint
CREATE TABLE `service_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_categories_tenant_name_unique` UNIQUE(`tenantId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `service_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`serviceId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` decimal(12,3) NOT NULL DEFAULT '1',
	`required` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_products_service_product_unique` UNIQUE(`serviceId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`categoryId` int,
	`name` varchar(180) NOT NULL,
	`description` text,
	`estimatedMinutes` int NOT NULL DEFAULT 60,
	`laborPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`estimatedCost` decimal(12,2) NOT NULL DEFAULT '0',
	`desiredMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`quoteQuestions` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`document` varchar(32),
	`contactName` varchar(160),
	`phone` varchar(32),
	`email` varchar(320),
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_branding` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`logoUrl` text,
	`primaryColor` varchar(16) NOT NULL DEFAULT '#E84D1C',
	`secondaryColor` varchar(16) NOT NULL DEFAULT '#171717',
	`accentColor` varchar(16) NOT NULL DEFAULT '#F5B33A',
	`publicTitle` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_branding_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_branding_tenant_unique` UNIQUE(`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','attendant','technician') NOT NULL DEFAULT 'attendant',
	`permissions` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_members_tenant_user_unique` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`legalName` varchar(200),
	`document` varchar(32),
	`phone` varchar(32),
	`whatsapp` varchar(32),
	`email` varchar(320),
	`address` json,
	`openingHours` json,
	`defaultLaborHourlyRate` decimal(12,2) NOT NULL DEFAULT '0',
	`defaultPartsMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`minimumMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`attendantMaxDiscountPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`quoteValidityDays` int NOT NULL DEFAULT 7,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_settings_tenant_unique` UNIQUE(`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`status` enum('trial','active','suspended','inactive') NOT NULL DEFAULT 'trial',
	`planId` int,
	`primaryOwnerUserId` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`customerId` int NOT NULL,
	`make` varchar(100) NOT NULL,
	`model` varchar(140) NOT NULL,
	`modelYear` int,
	`manufactureYear` int,
	`plate` varchar(16),
	`mileage` int,
	`engine` varchar(120),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_order_checklists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`workOrderId` int NOT NULL,
	`label` varchar(200) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`completedByUserId` int,
	`completedAt` timestamp,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_order_checklists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_order_consumption` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`workOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`reservationId` int,
	`quantity` decimal(12,3) NOT NULL,
	`unitCost` decimal(12,2) NOT NULL,
	`consumedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_order_consumption_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`workOrderId` int NOT NULL,
	`productId` int,
	`serviceId` int,
	`description` varchar(255) NOT NULL,
	`itemType` enum('product','service','custom') NOT NULL,
	`quantity` decimal(12,3) NOT NULL DEFAULT '1',
	`unitPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`expectedUnitCost` decimal(12,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`number` int NOT NULL,
	`quoteId` int,
	`appointmentId` int,
	`customerId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`status` enum('scheduled','received','diagnosis','awaiting_approval','awaiting_part','in_service','completed','delivered','cancelled') NOT NULL DEFAULT 'scheduled',
	`assignedToUserId` int,
	`estimatedTotal` decimal(12,2) NOT NULL DEFAULT '0',
	`estimatedCostTotal` decimal(12,2) NOT NULL DEFAULT '0',
	`realCostTotal` decimal(12,2) NOT NULL DEFAULT '0',
	`realMarginPercent` decimal(7,2) NOT NULL DEFAULT '0',
	`warrantyDays` int,
	`notes` text,
	`completedAt` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `work_orders_tenant_number_unique` UNIQUE(`tenantId`,`number`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `platformRole` enum('platform_user','super_admin') DEFAULT 'platform_user' NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_assignedToUserId_users_id_fk` FOREIGN KEY (`assignedToUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_quoteRequestId_quote_requests_id_fk` FOREIGN KEY (`quoteRequestId`) REFERENCES `quote_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_items` ADD CONSTRAINT `kit_items_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_items` ADD CONSTRAINT `kit_items_kitId_kits_id_fk` FOREIGN KEY (`kitId`) REFERENCES `kits`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_items` ADD CONSTRAINT `kit_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_items` ADD CONSTRAINT `kit_items_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kits` ADD CONSTRAINT `kits_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kits` ADD CONSTRAINT `kits_categoryId_service_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_product_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_purchaseOrderId_purchase_orders_id_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_events` ADD CONSTRAINT `quote_events_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_events` ADD CONSTRAINT `quote_events_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_events` ADD CONSTRAINT `quote_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_kitId_kits_id_fk` FOREIGN KEY (`kitId`) REFERENCES `kits`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD CONSTRAINT `quote_requests_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD CONSTRAINT `quote_requests_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD CONSTRAINT `quote_requests_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD CONSTRAINT `quote_requests_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD CONSTRAINT `quote_requests_assignedToUserId_users_id_fk` FOREIGN KEY (`assignedToUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_quoteRequestId_quote_requests_id_fk` FOREIGN KEY (`quoteRequestId`) REFERENCES `quote_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenues` ADD CONSTRAINT `revenues_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenues` ADD CONSTRAINT `revenues_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenues` ADD CONSTRAINT `revenues_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenues` ADD CONSTRAINT `revenues_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduled_tasks` ADD CONSTRAINT `scheduled_tasks_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_categories` ADD CONSTRAINT `service_categories_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_products` ADD CONSTRAINT `service_products_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_products` ADD CONSTRAINT `service_products_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_products` ADD CONSTRAINT `service_products_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_categoryId_service_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `service_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_branding` ADD CONSTRAINT `tenant_branding_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_members` ADD CONSTRAINT `tenant_members_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_members` ADD CONSTRAINT `tenant_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD CONSTRAINT `tenant_settings_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_planId_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_primaryOwnerUserId_users_id_fk` FOREIGN KEY (`primaryOwnerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_checklists` ADD CONSTRAINT `work_order_checklists_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_checklists` ADD CONSTRAINT `work_order_checklists_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_checklists` ADD CONSTRAINT `work_order_checklists_completedByUserId_users_id_fk` FOREIGN KEY (`completedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_consumption` ADD CONSTRAINT `work_order_consumption_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_consumption` ADD CONSTRAINT `work_order_consumption_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_consumption` ADD CONSTRAINT `work_order_consumption_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_consumption` ADD CONSTRAINT `wo_consumption_reservation_fk` FOREIGN KEY (`reservationId`) REFERENCES `inventory_reservations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_consumption` ADD CONSTRAINT `wo_consumption_user_fk` FOREIGN KEY (`consumedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_items` ADD CONSTRAINT `work_order_items_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_items` ADD CONSTRAINT `work_order_items_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_items` ADD CONSTRAINT `work_order_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_order_items` ADD CONSTRAINT `work_order_items_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_assignedToUserId_users_id_fk` FOREIGN KEY (`assignedToUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_tenant_start_idx` ON `appointments` (`tenantId`,`scheduledStart`);--> statement-breakpoint
CREATE INDEX `appointments_tenant_status_idx` ON `appointments` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `attachments_tenant_request_idx` ON `attachments` (`tenantId`,`quoteRequestId`);--> statement-breakpoint
CREATE INDEX `attachments_tenant_quote_idx` ON `attachments` (`tenantId`,`quoteId`);--> statement-breakpoint
CREATE INDEX `attachments_tenant_work_order_idx` ON `attachments` (`tenantId`,`workOrderId`);--> statement-breakpoint
CREATE INDEX `audit_logs_tenant_entity_idx` ON `audit_logs` (`tenantId`,`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_date_idx` ON `audit_logs` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `customers_tenant_name_idx` ON `customers` (`tenantId`,`name`);--> statement-breakpoint
CREATE INDEX `customers_tenant_phone_idx` ON `customers` (`tenantId`,`whatsapp`);--> statement-breakpoint
CREATE INDEX `expenses_tenant_status_date_idx` ON `expenses` (`tenantId`,`status`,`expenseDate`);--> statement-breakpoint
CREATE INDEX `inventory_balances_tenant_idx` ON `inventory_balances` (`tenantId`);--> statement-breakpoint
CREATE INDEX `inventory_movements_tenant_product_date_idx` ON `inventory_movements` (`tenantId`,`productId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inventory_reservations_tenant_product_idx` ON `inventory_reservations` (`tenantId`,`productId`);--> statement-breakpoint
CREATE INDEX `inventory_reservations_tenant_quote_idx` ON `inventory_reservations` (`tenantId`,`quoteId`);--> statement-breakpoint
CREATE INDEX `kit_items_tenant_kit_idx` ON `kit_items` (`tenantId`,`kitId`);--> statement-breakpoint
CREATE INDEX `kits_tenant_name_idx` ON `kits` (`tenantId`,`name`);--> statement-breakpoint
CREATE INDEX `notifications_tenant_user_read_idx` ON `notifications` (`tenantId`,`userId`,`readAt`);--> statement-breakpoint
CREATE INDEX `products_tenant_name_idx` ON `products` (`tenantId`,`name`);--> statement-breakpoint
CREATE INDEX `products_tenant_category_idx` ON `products` (`tenantId`,`categoryId`);--> statement-breakpoint
CREATE INDEX `purchase_order_items_tenant_order_idx` ON `purchase_order_items` (`tenantId`,`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `purchase_orders_tenant_status_idx` ON `purchase_orders` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `quote_events_tenant_quote_idx` ON `quote_events` (`tenantId`,`quoteId`);--> statement-breakpoint
CREATE INDEX `quote_items_tenant_quote_idx` ON `quote_items` (`tenantId`,`quoteId`);--> statement-breakpoint
CREATE INDEX `quote_requests_tenant_status_idx` ON `quote_requests` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_tenant_status_idx` ON `quotes` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `revenues_tenant_status_date_idx` ON `revenues` (`tenantId`,`status`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `scheduled_tasks_uid_idx` ON `scheduled_tasks` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `service_products_tenant_service_idx` ON `service_products` (`tenantId`,`serviceId`);--> statement-breakpoint
CREATE INDEX `services_tenant_name_idx` ON `services` (`tenantId`,`name`);--> statement-breakpoint
CREATE INDEX `services_tenant_category_idx` ON `services` (`tenantId`,`categoryId`);--> statement-breakpoint
CREATE INDEX `suppliers_tenant_name_idx` ON `suppliers` (`tenantId`,`name`);--> statement-breakpoint
CREATE INDEX `tenant_members_user_idx` ON `tenant_members` (`userId`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);--> statement-breakpoint
CREATE INDEX `vehicles_tenant_customer_idx` ON `vehicles` (`tenantId`,`customerId`);--> statement-breakpoint
CREATE INDEX `vehicles_tenant_plate_idx` ON `vehicles` (`tenantId`,`plate`);--> statement-breakpoint
CREATE INDEX `work_order_checklists_tenant_order_idx` ON `work_order_checklists` (`tenantId`,`workOrderId`);--> statement-breakpoint
CREATE INDEX `work_order_consumption_tenant_order_idx` ON `work_order_consumption` (`tenantId`,`workOrderId`);--> statement-breakpoint
CREATE INDEX `work_order_items_tenant_order_idx` ON `work_order_items` (`tenantId`,`workOrderId`);--> statement-breakpoint
CREATE INDEX `work_orders_tenant_status_idx` ON `work_orders` (`tenantId`,`status`);
