-- Phase 1: Content Lock — rename pass_code + add lock_sessions/lock_events
-- Generated manually to ensure RENAME COLUMN (not DROP/ADD)

-- 1. Rename campaigns.pass_code_encrypted → pass_code (preserves existing data)
ALTER TABLE `campaigns` RENAME COLUMN `pass_code_encrypted` TO `pass_code`;
--> statement-breakpoint

-- 2. Lock sessions table
CREATE TABLE `lock_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`publisher_id` text DEFAULT 'test_pub' NOT NULL,
	`content_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`attempts_left` integer DEFAULT 5 NOT NULL,
	`user_fingerprint` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_lock_sessions_status_expires` ON `lock_sessions` (`status`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_lock_sessions_campaign` ON `lock_sessions` (`campaign_id`);
--> statement-breakpoint

-- 3. Lock events table
CREATE TABLE `lock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `lock_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_lock_events_session` ON `lock_events` (`session_id`,`created_at`);
