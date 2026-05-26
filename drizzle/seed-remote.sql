-- Seed data for remote D1
-- Password: 123456 (bcrypt hash)

-- 1. Users
INSERT INTO users (id, email, name, phone, password_hash, role, status, created_at, updated_at) VALUES
  ('admin-001', 'admin@senlyzer.io', 'Admin Senlyzer', '0901234567', '$2b$10$qvJ4mnpAweqDxxMeknZaW.ay3BMGRCUcoNPX/5g9aeF8.ILQUXOsa', 'admin', 'active', datetime('now'), datetime('now')),
  ('emp-001', 'mai.nguyen@senlyzer.io', 'Nguyễn Thị Mai', '0912345678', '$2b$10$qvJ4mnpAweqDxxMeknZaW.ay3BMGRCUcoNPX/5g9aeF8.ILQUXOsa', 'employee', 'active', datetime('now'), datetime('now'));

-- 2. Employee permissions
INSERT INTO user_permissions (user_id, permission) VALUES
  ('emp-001', 'campaigns.view'),
  ('emp-001', 'campaigns.create'),
  ('emp-001', 'campaigns.edit'),
  ('emp-001', 'categories.view'),
  ('emp-001', 'alerts.view'),
  ('emp-001', 'reports.view');

-- 3. Parent categories
INSERT INTO parent_categories (id, name, website, initials, slug, description, daily_user_target, status, created_by, created_at, updated_at) VALUES
  ('pcat-001', 'Caraluna', 'caraluna.com', 'CL', 'caraluna', NULL, 25, 'active', 'admin-001', datetime('now'), datetime('now')),
  ('pcat-002', 'Luna Silver', 'lunasilver.com', 'LS', 'luna-silver', NULL, 25, 'active', 'admin-001', datetime('now'), datetime('now')),
  ('pcat-003', 'Luna Fashion', 'lunafashion.com', 'LF', 'luna-fashion', NULL, 25, 'active', 'admin-001', datetime('now'), datetime('now'));

-- 4. Child categories
INSERT INTO child_categories (id, parent_id, name, website, initials, slug, description, daily_user_target, status, created_by, created_at, updated_at) VALUES
  ('ccat-001', 'pcat-001', 'Dây chuyền bạc', 'caraluna.com/day-chuyen', 'DC', 'day-chuyen-bac', NULL, 10, 'active', 'admin-001', datetime('now'), datetime('now')),
  ('ccat-002', 'pcat-001', 'Nhẫn bạc nữ', 'caraluna.com/nhan-bac', 'NB', 'nhan-bac-nu', NULL, 8, 'active', 'admin-001', datetime('now'), datetime('now')),
  ('ccat-003', 'pcat-002', 'Lắc tay bạc', 'lunasilver.com/lac-tay', 'LT', 'lac-tay-bac', NULL, 12, 'active', 'admin-001', datetime('now'), datetime('now'));
