ALTER TABLE `notifications` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `vehicleId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `workOrderId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_workOrderId_work_orders_id_fk` FOREIGN KEY (`workOrderId`) REFERENCES `work_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_tenant_customer_idx` ON `notifications` (`tenantId`,`customerId`);--> statement-breakpoint
CREATE INDEX `notifications_tenant_vehicle_idx` ON `notifications` (`tenantId`,`vehicleId`);