ALTER TABLE `tenants` ADD `isDemo` boolean NOT NULL DEFAULT false;
CREATE INDEX `tenants_demo_idx` ON `tenants` (`isDemo`);

UPDATE `tenants`
SET `isDemo` = true
WHERE `slug` = 'performance-garage';
