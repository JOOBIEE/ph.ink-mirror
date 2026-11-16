export const FEEDBACK_STATUSES = ['new', 'read', 'archived'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export type AdminFeedback = {
  id: number
  kind: string
  message: string
  email: string | null
  page: string | null
  status: string
  createdAt: number
}

type FeedbackRow = {
  id: number
  kind: string
  message: string
  contact_email: string | null
  page: string | null
  status: string
  created_at: number
}

export async function listAdminFeedback(
  db: D1Database,
  options: { status: FeedbackStatus | null; limit: number; offset: number },
): Promise<AdminFeedback[]> {
  const result = await db
    .prepare(
      `SELECT id, kind, message, contact_email, page, status, created_at
       FROM feedback
       WHERE (? IS NULL OR status = ?)
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(options.status, options.status, options.limit, options.offset)
    .all<FeedbackRow>()

  return result.results.map((row) => ({
    id: row.id,
    kind: row.kind,
    message: row.message,
    email: row.contact_email,
    page: row.page,
    status: row.status,
    createdAt: row.created_at,
  }))
}

export async function countNewFeedback(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM feedback WHERE status = 'new'")
    .first<{ total: number }>()
  return row?.total ?? 0
}

// Changes one message's status and records it in the admin audit log in the same step.
// Returns false when there is no such message.
export async function setFeedbackStatus(
  db: D1Database,
  adminId: number,
  id: number,
  status: FeedbackStatus,
  now: number,
): Promise<boolean> {
  const found = await db
    .prepare('SELECT status FROM feedback WHERE id = ?')
    .bind(id)
    .first<{ status: string }>()
  if (!found) return false
  if (found.status === status) return true

  await db.batch([
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, id),
    db
      .prepare(
        `INSERT INTO admin_audit (admin_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'feedback_status', 'system', ?, ?, ?)`,
      )
      .bind(adminId, id, `Marked feedback as ${status}`, now),
  ])
  return true
}