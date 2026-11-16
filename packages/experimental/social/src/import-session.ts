/** Persist a shared event snapshot as a stored Session under a Workspace cwd. */

import { randomUUID } from 'node:crypto'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { Session, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence'

/** Persistence face used to materialize an imported share. */
export interface SocialImportPersistence {
  create(header: SessionHeader, options: { signal: AbortSignal }): Promise<Pick<SessionHandle, 'append' | 'flush' | 'close'>>
}

/** Optional list-cache refresh after import. */
export interface SocialImportProjectionCache {
  coldSnapshot(header: SessionHeader, inheritedEventCount: SessionLogOffset, events: readonly SessionEvent[]): unknown
}

/** Workspace membership for the imported Session. */
export interface SocialImportWorkspace {
  readonly id: string
  readonly path: string
  attachSession(sessionId: SessionId): Promise<void>
}

/**
 * Validate and write a seeded Session from share events, then attach it to the Workspace.
 * @param persistence - session persistence backend.
 * @param workspace - receiving Workspace (cwd + attach).
 * @param events - sanitized share events.
 * @param signal - cancellation.
 * @param projectionCache - optional Session list cache.
 * @returns new Session id.
 */
export async function importShareSession(
  persistence: SocialImportPersistence,
  workspace: SocialImportWorkspace,
  events: readonly SessionEvent[],
  signal: AbortSignal,
  projectionCache?: SocialImportProjectionCache,
): Promise<SessionId> {
  const id = brandString<SessionId>(randomUUID())
  const createdAt = Date.now()
  const header: SessionHeader = {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt,
    cwd: workspace.path,
    isSeeded: false,
  }
  Session.create(id, events, header)
  signal.throwIfAborted()
  const handle = await persistence.create(header, { signal })
  try {
    await handle.append(events)
    await handle.flush()
  } finally {
    await handle.close()
  }
  projectionCache?.coldSnapshot(header, brandNumber<SessionLogOffset>(0), events)
  await workspace.attachSession(id)
  return id
}
