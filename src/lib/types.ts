export type AppBindings = {
  DB: D1Database
  MEDIA: R2Bucket
  JWT_SECRET: string
  RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> }
}

export type AppVariables = {
  userId: string
  userRole: 'admin' | 'employee'
}

export type AppEnv = {
  Bindings: AppBindings
  Variables: AppVariables
}

export type Permission =
  | 'campaigns.view'
  | 'campaigns.create'
  | 'campaigns.edit'
  | 'campaigns.delete'
  | 'categories.view'
  | 'categories.create'
  | 'categories.edit'
  | 'categories.delete'
  | 'users.view'
  | 'users.manage'
  | 'alerts.view'
  | 'alerts.manage'
  | 'reports.view'
