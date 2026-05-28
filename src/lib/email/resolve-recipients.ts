import { and, eq } from 'drizzle-orm'
import { campaigns, users } from '../../db/schema'
import type { Database } from '../../db/client'

export type ResolvedRecipients = {
  to: string[]
  assigneeName: string | null
  fallbackToAdmin: boolean
}

// Resolves email recipients for a campaign-related notification.
// Priority: assignee (if active) → all active admins as fallback.
export async function resolveRecipients(
  db: Database,
  campaignId: string,
): Promise<ResolvedRecipients> {
  const camp = await db.select({ assignedTo: campaigns.assignedTo })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get()

  if (!camp) return { to: [], assigneeName: null, fallbackToAdmin: false }

  if (camp.assignedTo) {
    const user = await db.select({
      email: users.email,
      name: users.name,
      status: users.status,
    })
      .from(users)
      .where(eq(users.id, camp.assignedTo))
      .get()

    if (user && user.status === 'active') {
      return { to: [user.email], assigneeName: user.name, fallbackToAdmin: false }
    }
  }

  // Fallback: all active admins
  const admins = await db.select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))

  return {
    to: admins.map((a) => a.email).filter((e) => e && e.length > 0),
    assigneeName: null,
    fallbackToAdmin: true,
  }
}
