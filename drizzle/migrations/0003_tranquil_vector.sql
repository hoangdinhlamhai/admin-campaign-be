ALTER TABLE `campaigns` ADD `assigned_to` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `idx_camp_assignee` ON `campaigns` (`assigned_to`);