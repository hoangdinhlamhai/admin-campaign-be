import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ═══════════════════════════════════════════════════════════
// Users & Permissions
// ═══════════════════════════════════════════════════════════

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'employee'] }).notNull().default('employee'),
  status: text('status', { enum: ['active', 'inactive', 'suspended'] }).notNull().default('active'),
  lastLoginAt: text('last_login_at'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const userPermissions = sqliteTable('user_permissions', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
}, (table) => [
  uniqueIndex('idx_user_perm').on(table.userId, table.permission),
])

// ═══════════════════════════════════════════════════════════
// Parent Categories (Website/Brand)
// ═══════════════════════════════════════════════════════════

export const parentCategories = sqliteTable('parent_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  website: text('website'),
  initials: text('initials'),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  dailyUserTarget: integer('daily_user_target').default(0),
  status: text('status', { enum: ['active', 'paused', 'archived'] }).notNull().default('active'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_parent_cat_status').on(table.status),
])

// ═══════════════════════════════════════════════════════════
// Child Categories (Product Group)
// ═══════════════════════════════════════════════════════════

export const childCategories = sqliteTable('child_categories', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').notNull().references(() => parentCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  website: text('website'),
  initials: text('initials'),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  dailyUserTarget: integer('daily_user_target').default(0),
  status: text('status', { enum: ['active', 'paused', 'archived'] }).notNull().default('active'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_child_cat_parent').on(table.parentId),
  index('idx_child_cat_status').on(table.status),
])

// ═══════════════════════════════════════════════════════════
// Campaigns
// ═══════════════════════════════════════════════════════════

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  parentCategoryId: text('parent_category_id').notNull().references(() => parentCategories.id),
  childCategoryId: text('child_category_id').references(() => childCategories.id),
  name: text('name').notNull(),
  keyword: text('keyword'),
  targetUrl: text('target_url'),
  passCodeEncrypted: text('pass_code_encrypted'),
  dailyUserTarget: integer('daily_user_target').default(0),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).default('medium'),
  maxWrongAttempts: integer('max_wrong_attempts'),
  status: text('status', { enum: ['draft', 'active', 'paused', 'stopped', 'archived'] }).notNull().default('draft'),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  createdBy: text('created_by').references(() => users.id),
  updatedBy: text('updated_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  publishedAt: text('published_at'),
}, (table) => [
  index('idx_camp_parent_status').on(table.parentCategoryId, table.status),
  index('idx_camp_priority').on(table.priority),
])

// ═══════════════════════════════════════════════════════════
// Campaign Instructions + Versions
// ═══════════════════════════════════════════════════════════

export const campaignInstructions = sqliteTable('campaign_instructions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().unique().references(() => campaigns.id, { onDelete: 'cascade' }),
  contentHtml: text('content_html'),
  contentJson: text('content_json'),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const campaignInstructionVersions = sqliteTable('campaign_instruction_versions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contentHtml: text('content_html'),
  contentJson: text('content_json'),
  version: integer('version').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════════════════════════
// Media Assets
// ═══════════════════════════════════════════════════════════

export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(),
  ownerType: text('owner_type').notNull(),
  ownerId: text('owner_id').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes'),
  storageKey: text('storage_key').notNull(),
  publicUrl: text('public_url').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════════════════════════
// Campaign Settings (1:1 with campaigns)
// ═══════════════════════════════════════════════════════════

export const campaignSettings = sqliteTable('campaign_settings', {
  campaignId: text('campaign_id').primaryKey().references(() => campaigns.id, { onDelete: 'cascade' }),
  notifyLowUsers: integer('notify_low_users', { mode: 'boolean' }).default(false),
  lowUsersThreshold: integer('low_users_threshold'),
  notifyCampaignPaused: integer('notify_campaign_paused', { mode: 'boolean' }).default(false),
  autoReactivateNextDay: integer('auto_reactivate_next_day', { mode: 'boolean' }).default(false),
  limitWrongPass: integer('limit_wrong_pass', { mode: 'boolean' }).default(false),
  maxWrongPassAttempts: integer('max_wrong_pass_attempts'),
  pauseOnNoValidEntry: integer('pause_on_no_valid_entry', { mode: 'boolean' }).default(false),
  noValidEntryDisplays: integer('no_valid_entry_displays'),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════════════════════════
// Tracking: Attempts + Daily Stats
// ═══════════════════════════════════════════════════════════

export const campaignAttempts = sqliteTable('campaign_attempts', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  anonymousId: text('anonymous_id'),
  eventType: text('event_type', { enum: ['displayed', 'pass_valid', 'pass_invalid', 'task_completed'] }).notNull(),
  isSuccess: integer('is_success', { mode: 'boolean' }),
  source: text('source'),
  ipAddress: text('ip_address'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_attempts_camp_time').on(table.campaignId, table.createdAt),
  index('idx_attempts_event_time').on(table.eventType, table.createdAt),
])

export const campaignDailyStats = sqliteTable('campaign_daily_stats', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  statDate: text('stat_date').notNull(),
  dailyUserTarget: integer('daily_user_target'),
  completedCount: integer('completed_count').default(0),
  missingCount: integer('missing_count').default(0),
  displayCount: integer('display_count').default(0),
  wrongEntryCount: integer('wrong_entry_count').default(0),
  validEntryCount: integer('valid_entry_count').default(0),
  conversionRate: real('conversion_rate'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_camp_daily_unique').on(table.campaignId, table.statDate),
])

// ═══════════════════════════════════════════════════════════
// Category Daily Stats
// ═══════════════════════════════════════════════════════════

export const categoryDailyStats = sqliteTable('category_daily_stats', {
  id: text('id').primaryKey(),
  parentCategoryId: text('parent_category_id').references(() => parentCategories.id),
  childCategoryId: text('child_category_id').references(() => childCategories.id),
  statDate: text('stat_date').notNull(),
  campaignCount: integer('campaign_count').default(0),
  dailyUserTarget: integer('daily_user_target').default(0),
  completedCount: integer('completed_count').default(0),
  missingCount: integer('missing_count').default(0),
  progressRate: real('progress_rate'),
}, (table) => [
  uniqueIndex('idx_cat_daily_unique').on(table.parentCategoryId, table.childCategoryId, table.statDate),
])

// ═══════════════════════════════════════════════════════════
// Ad Sources + Ad Daily Stats
// ═══════════════════════════════════════════════════════════

export const adSources = sqliteTable('ad_sources', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['google_ads', 'tiktok_ads', 'manual'] }).notNull(),
  name: text('name').notNull(),
  externalAccountId: text('external_account_id'),
  status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const campaignAdDailyStats = sqliteTable('campaign_ad_daily_stats', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  adSourceId: text('ad_source_id').notNull().references(() => adSources.id),
  externalCampaignCode: text('external_campaign_code'),
  statDate: text('stat_date').notNull(),
  cost: integer('cost').default(0),
  clicks: integer('clicks').default(0),
  tasksCompleted: integer('tasks_completed').default(0),
  cpa: integer('cpa').default(0),
  conversionRate: real('conversion_rate'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_ad_daily_unique').on(table.campaignId, table.adSourceId, table.externalCampaignCode, table.statDate),
])

// ═══════════════════════════════════════════════════════════
// Alerts
// ═══════════════════════════════════════════════════════════

export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => campaigns.id),
  parentCategoryId: text('parent_category_id').references(() => parentCategories.id),
  childCategoryId: text('child_category_id').references(() => childCategories.id),
  severity: text('severity', { enum: ['info', 'warning', 'danger'] }).notNull(),
  status: text('status', { enum: ['open', 'acknowledged', 'resolved'] }).notNull().default('open'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  triggeredAt: text('triggered_at').notNull().default(sql`(datetime('now'))`),
  resolvedBy: text('resolved_by').references(() => users.id),
  resolvedAt: text('resolved_at'),
}, (table) => [
  index('idx_alerts_status').on(table.status, table.severity),
  index('idx_alerts_campaign').on(table.campaignId),
  index('idx_alerts_dedup').on(table.campaignId, table.type, table.status, table.triggeredAt),
])

// ═══════════════════════════════════════════════════════════
// Alerts Meta (single-row counter for FE polling)
// ═══════════════════════════════════════════════════════════

export const alertsMeta = sqliteTable('alerts_meta', {
  id: integer('id').primaryKey().default(1),
  version: integer('version').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════════════════════════
// Global Settings (key-value store for system defaults)
// ═══════════════════════════════════════════════════════════

export const globalSettings = sqliteTable('global_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════════════════════════
// Audit Logs
// ═══════════════════════════════════════════════════════════

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  changes: text('changes'),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_audit_actor').on(table.actorId, table.createdAt),
  index('idx_audit_entity').on(table.entityType, table.entityId),
])
