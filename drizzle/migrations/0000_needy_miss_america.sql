CREATE TABLE `ad_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`external_account_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`parent_category_id` text,
	`child_category_id` text,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`triggered_at` text DEFAULT (datetime('now')) NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_category_id`) REFERENCES `parent_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_category_id`) REFERENCES `child_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_status` ON `alerts` (`status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_alerts_campaign` ON `alerts` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`changes` text,
	`ip_address` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `campaign_ad_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_source_id` text NOT NULL,
	`external_campaign_code` text,
	`stat_date` text NOT NULL,
	`cost` integer DEFAULT 0,
	`clicks` integer DEFAULT 0,
	`tasks_completed` integer DEFAULT 0,
	`cpa` integer DEFAULT 0,
	`conversion_rate` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ad_source_id`) REFERENCES `ad_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ad_daily_unique` ON `campaign_ad_daily_stats` (`campaign_id`,`ad_source_id`,`external_campaign_code`,`stat_date`);--> statement-breakpoint
CREATE TABLE `campaign_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`anonymous_id` text,
	`event_type` text NOT NULL,
	`is_success` integer,
	`source` text,
	`ip_address` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_camp_time` ON `campaign_attempts` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_attempts_event_time` ON `campaign_attempts` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaign_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`stat_date` text NOT NULL,
	`daily_user_target` integer,
	`completed_count` integer DEFAULT 0,
	`missing_count` integer DEFAULT 0,
	`display_count` integer DEFAULT 0,
	`wrong_entry_count` integer DEFAULT 0,
	`valid_entry_count` integer DEFAULT 0,
	`conversion_rate` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_camp_daily_unique` ON `campaign_daily_stats` (`campaign_id`,`stat_date`);--> statement-breakpoint
CREATE TABLE `campaign_instruction_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`content_html` text,
	`content_json` text,
	`version` integer NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaign_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`content_html` text,
	`content_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_instructions_campaign_id_unique` ON `campaign_instructions` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `campaign_settings` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`notify_low_users` integer DEFAULT false,
	`low_users_threshold` integer,
	`notify_campaign_paused` integer DEFAULT false,
	`auto_reactivate_next_day` integer DEFAULT false,
	`limit_wrong_pass` integer DEFAULT false,
	`max_wrong_pass_attempts` integer,
	`pause_on_no_valid_entry` integer DEFAULT false,
	`no_valid_entry_displays` integer,
	`updated_by` text,
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`parent_category_id` text NOT NULL,
	`child_category_id` text,
	`name` text NOT NULL,
	`keyword` text,
	`target_url` text,
	`pass_code_encrypted` text,
	`daily_user_target` integer DEFAULT 0,
	`priority` text DEFAULT 'medium',
	`max_wrong_attempts` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`parent_category_id`) REFERENCES `parent_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_category_id`) REFERENCES `child_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_code_unique` ON `campaigns` (`code`);--> statement-breakpoint
CREATE INDEX `idx_camp_parent_status` ON `campaigns` (`parent_category_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_camp_priority` ON `campaigns` (`priority`);--> statement-breakpoint
CREATE TABLE `category_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_category_id` text,
	`child_category_id` text,
	`stat_date` text NOT NULL,
	`campaign_count` integer DEFAULT 0,
	`daily_user_target` integer DEFAULT 0,
	`completed_count` integer DEFAULT 0,
	`missing_count` integer DEFAULT 0,
	`progress_rate` real,
	FOREIGN KEY (`parent_category_id`) REFERENCES `parent_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_category_id`) REFERENCES `child_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cat_daily_unique` ON `category_daily_stats` (`parent_category_id`,`child_category_id`,`stat_date`);--> statement-breakpoint
CREATE TABLE `child_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`initials` text,
	`slug` text NOT NULL,
	`description` text,
	`daily_user_target` integer DEFAULT 0,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `parent_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_categories_slug_unique` ON `child_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_child_cat_parent` ON `child_categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_child_cat_status` ON `child_categories` (`status`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer,
	`storage_key` text NOT NULL,
	`public_url` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `parent_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`initials` text,
	`slug` text NOT NULL,
	`description` text,
	`daily_user_target` integer DEFAULT 0,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_categories_slug_unique` ON `parent_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_parent_cat_status` ON `parent_categories` (`status`);--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_perm` ON `user_permissions` (`user_id`,`permission`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);