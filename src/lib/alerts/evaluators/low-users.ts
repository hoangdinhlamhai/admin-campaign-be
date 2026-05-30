import type { Database } from '../../../db/client'

export type DailyEvaluatorResult = { scanned: number; emitted: number }

// Deprecated: low-users alert removed. Replaced by target-reached evaluator
// which fires real-time on /api/v1/lock/verify when completed >= dailyUserTarget.
// Kept as no-op so cron handler imports stay valid.
export async function runDailyEvaluator(_db: Database): Promise<DailyEvaluatorResult> {
  return { scanned: 0, emitted: 0 }
}
