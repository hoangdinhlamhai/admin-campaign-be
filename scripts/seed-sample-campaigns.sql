-- Seed sample campaigns + daily stats for /campaigns and /categories pages
-- Today's date: 2026-05-28

-- Campaigns (6 total: 4 active, 1 paused, 1 draft)
INSERT INTO campaigns (id, code, parent_category_id, child_category_id, name, keyword, target_url, daily_user_target, priority, max_wrong_attempts, status, created_by, updated_by, created_at, updated_at, published_at)
VALUES
  ('cmp-001', 'CMP-001', 'eb67a040-1a81-4de9-86a5-59603e543abb', '22cc83c3-d8aa-48cc-b239-fd6e105a07e6', 'Dây chuyền bạc nữ - Tháng 5', 'day chuyen bac nu', 'https://caraluna.vn/day-chuyen', 50, 'high', 3, 'active', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-20 08:00:00', '2026-05-28 06:00:00', '2026-05-20 08:30:00'),
  ('cmp-002', 'CMP-002', 'eb67a040-1a81-4de9-86a5-59603e543abb', '98830ccb-90c8-4c38-95ff-a017976023ba', 'Nhẫn bạc nữ - Quà tặng', 'nhan bac nu', 'https://caraluna.vn/nhan', 30, 'medium', 3, 'active', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-21 09:00:00', '2026-05-28 06:00:00', '2026-05-21 09:30:00'),
  ('cmp-003', 'CMP-003', 'eb67a040-1a81-4de9-86a5-59603e543abb', NULL, 'Caraluna - Tổng hợp', 'caraluna', 'https://caraluna.vn', 40, 'medium', 3, 'active', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-22 10:00:00', '2026-05-28 06:00:00', '2026-05-22 10:30:00'),
  ('cmp-004', 'CMP-004', '02acf62c-4e4a-4fea-b52b-9e3b50748ab2', '24c68edd-feb1-48c3-910c-7cbb5ebf24d8', 'Lắc tay bạc - Hè 2026', 'lac tay bac', 'https://lunasilver.vn/lac-tay', 35, 'high', 3, 'active', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-23 11:00:00', '2026-05-28 06:00:00', '2026-05-23 11:30:00'),
  ('cmp-005', 'CMP-005', '5777246a-91a2-48c5-a24d-f6cf55172d76', NULL, 'Luna Fashion - Bông tai', 'bong tai bac', 'https://lunafashion.vn/bong-tai', 25, 'low', 3, 'paused', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-19 07:00:00', '2026-05-27 18:00:00', '2026-05-19 07:30:00'),
  ('cmp-006', 'CMP-006', '02acf62c-4e4a-4fea-b52b-9e3b50748ab2', NULL, 'Luna Silver - Vòng cổ (draft)', 'vong co bac', NULL, 20, 'medium', 3, 'draft', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', 'ad317aa5-e4e7-4b12-9214-c08a0c78e02b', '2026-05-28 06:30:00', '2026-05-28 06:30:00', NULL);

-- Daily stats for today (2026-05-28) — only active campaigns
INSERT INTO campaign_daily_stats (id, campaign_id, stat_date, daily_user_target, completed_count, missing_count, display_count, wrong_entry_count, valid_entry_count, conversion_rate, created_at, updated_at)
VALUES
  ('dly-001-today', 'cmp-001', '2026-05-28', 50, 32, 18, 285, 47, 165, 11.23, '2026-05-28 06:00:00', '2026-05-28 06:00:00'),
  ('dly-002-today', 'cmp-002', '2026-05-28', 30, 18, 12, 156, 22, 98, 11.54, '2026-05-28 06:00:00', '2026-05-28 06:00:00'),
  ('dly-003-today', 'cmp-003', '2026-05-28', 40, 22, 18, 198, 35, 112, 11.11, '2026-05-28 06:00:00', '2026-05-28 06:00:00'),
  ('dly-004-today', 'cmp-004', '2026-05-28', 35, 28, 7, 220, 31, 142, 12.73, '2026-05-28 06:00:00', '2026-05-28 06:00:00'),
  ('dly-005-today', 'cmp-005', '2026-05-28', 25, 0, 25, 0, 0, 0, 0, '2026-05-28 06:00:00', '2026-05-28 06:00:00');

-- Yesterday stats (2026-05-27) — for /overview previous period delta
INSERT INTO campaign_daily_stats (id, campaign_id, stat_date, daily_user_target, completed_count, missing_count, display_count, wrong_entry_count, valid_entry_count, conversion_rate, created_at, updated_at)
VALUES
  ('dly-001-y', 'cmp-001', '2026-05-27', 50, 48, 2, 410, 65, 235, 11.71, '2026-05-27 06:00:00', '2026-05-27 06:00:00'),
  ('dly-002-y', 'cmp-002', '2026-05-27', 30, 26, 4, 245, 38, 142, 10.61, '2026-05-27 06:00:00', '2026-05-27 06:00:00'),
  ('dly-003-y', 'cmp-003', '2026-05-27', 40, 35, 5, 312, 52, 178, 11.22, '2026-05-27 06:00:00', '2026-05-27 06:00:00'),
  ('dly-004-y', 'cmp-004', '2026-05-27', 35, 33, 2, 290, 41, 165, 11.38, '2026-05-27 06:00:00', '2026-05-27 06:00:00');
