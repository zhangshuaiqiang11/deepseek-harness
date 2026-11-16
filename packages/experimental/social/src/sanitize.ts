/** Snapshot sanitization before share storage and import. */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

const STRIP_KEYS = new Set([
  'sourcePath',
  'token',
  'authorization',
  'authToken',
  'x-dsh-auth-token',
])

/**
 * Deep-clone events and drop local-path / credential-like keys.
 * Attachment id references are kept; attachment bytes are never embedded by this path.
 * @param events - logical session events from readSession.
 * @returns sanitized clone safe to put on the social wire store.
 */
export function sanitizeSessionEvents(events: readonly SessionEvent[]): SessionEvent[] {
  return events.map(event => scrub(structuredClone(event)) as SessionEvent)
}

/**
 * Identity helper: share path does not embed attachment blobs today.
 * @param events - already sanitized events.
 * @returns the same list (MVP has no embedded bytes to strip).
 */
export function stripAttachmentBytes(events: readonly SessionEvent[]): readonly SessionEvent[] {
  return events
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) {
    if (STRIP_KEYS.has(key)) continue
    next[key] = scrub(child)
  }
  return next
}
