-- Phase: rename notify_low_users → notify_target_reached, drop low_users_threshold
-- Preserves user values: notify_target_reached takes value of notify_low_users.
-- low_users_threshold removed (deprecated; pause threshold = campaigns.daily_user_target).

ALTER TABLE `campaign_settings` RENAME COLUMN `notify_low_users` TO `notify_target_reached`;
--> statement-breakpoint
ALTER TABLE `campaign_settings` DROP COLUMN `low_users_threshold`;
