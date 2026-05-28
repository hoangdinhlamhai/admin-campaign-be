import { users, userPermissions, parentCategories, childCategories, alertsMeta, globalSettings } from './schema'
import type { Database } from './client'
import { hashSync } from 'bcryptjs'
import { GLOBAL_SETTING_KEYS, GLOBAL_SETTING_DEFAULTS } from '../lib/settings/default-values'

export async function seed(db: Database) {
  const adminId = crypto.randomUUID()
  const empId = crypto.randomUUID()
  const passwordHash = hashSync('123456', 10)

  // ─── 1. Admin user ───
  await db.insert(users).values({
    id: adminId,
    email: 'admin@senlyzer.io',
    name: 'Admin Senlyzer',
    phone: '0901234567',
    passwordHash,
    role: 'admin',
    status: 'active',
  })

  // ─── 2. Employee user ───
  await db.insert(users).values({
    id: empId,
    email: 'mai.nguyen@senlyzer.io',
    name: 'Nguyễn Thị Mai',
    phone: '0912345678',
    passwordHash,
    role: 'employee',
    status: 'active',
    createdBy: adminId,
  })

  await db.insert(userPermissions).values([
    { userId: empId, permission: 'campaigns.view' },
    { userId: empId, permission: 'campaigns.create' },
    { userId: empId, permission: 'campaigns.edit' },
    { userId: empId, permission: 'categories.view' },
    { userId: empId, permission: 'alerts.view' },
    { userId: empId, permission: 'reports.view' },
  ])

  // ─── 3. Parent categories ───
  const pCara = crypto.randomUUID()
  const pLuna = crypto.randomUUID()
  const pFash = crypto.randomUUID()

  await db.insert(parentCategories).values([
    { id: pCara, name: 'Caraluna', website: 'caraluna.com', initials: 'CL', slug: 'caraluna', dailyUserTarget: 25, status: 'active', createdBy: adminId },
    { id: pLuna, name: 'Luna Silver', website: 'lunasilver.com', initials: 'LS', slug: 'luna-silver', dailyUserTarget: 25, status: 'active', createdBy: adminId },
    { id: pFash, name: 'Luna Fashion', website: 'lunafashion.com', initials: 'LF', slug: 'luna-fashion', dailyUserTarget: 25, status: 'active', createdBy: adminId },
  ])

  // ─── 4. Child categories ───
  await db.insert(childCategories).values([
    { id: crypto.randomUUID(), parentId: pCara, name: 'Dây chuyền bạc', website: 'caraluna.com/day-chuyen', initials: 'DC', slug: 'day-chuyen-bac', dailyUserTarget: 10, status: 'active', createdBy: adminId },
    { id: crypto.randomUUID(), parentId: pCara, name: 'Nhẫn bạc nữ', website: 'caraluna.com/nhan-bac', initials: 'NB', slug: 'nhan-bac-nu', dailyUserTarget: 8, status: 'active', createdBy: adminId },
    { id: crypto.randomUUID(), parentId: pLuna, name: 'Lắc tay bạc', website: 'lunasilver.com/lac-tay', initials: 'LT', slug: 'lac-tay-bac', dailyUserTarget: 12, status: 'active', createdBy: adminId },
  ])

  // ─── 5. Alerts meta singleton ───
  await db.insert(alertsMeta).values({ id: 1, version: 0 })

  // ─── 6. Global settings defaults ───
  await db.insert(globalSettings).values(
    GLOBAL_SETTING_KEYS.map((key) => ({
      key,
      value: JSON.stringify(GLOBAL_SETTING_DEFAULTS[key]),
      updatedBy: adminId,
    })),
  )

  // ─── 7. Settings permissions ───
  await db.insert(userPermissions).values([
    { userId: adminId, permission: 'settings.manage' },
    { userId: adminId, permission: 'settings.view' },
    { userId: empId, permission: 'settings.view' },
  ])

  return { adminId, empId, parentIds: { caraluna: pCara, lunaSilver: pLuna, lunaFashion: pFash } }
}
