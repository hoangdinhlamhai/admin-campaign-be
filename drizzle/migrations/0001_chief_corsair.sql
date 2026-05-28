CREATE TABLE `alerts_meta` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_dedup` ON `alerts` (`campaign_id`,`type`,`status`,`triggered_at`);