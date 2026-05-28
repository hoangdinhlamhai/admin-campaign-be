CREATE TABLE `global_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_by` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
