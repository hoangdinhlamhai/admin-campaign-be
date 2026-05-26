import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle/migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a0f3a23b9471445076d8b45f93718eb23b4e05b3d880b0d3285b0aac245736ff.sqlite',
  },
})
