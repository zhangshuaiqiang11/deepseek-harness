/** In-process registry of Sessions imported from social shares (read-only). */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SocialShareId } from './types.ts'

export interface SocialImportMark {
  readonly shareId: SocialShareId
  readonly readOnly: true
}

/** Session-id → social-import mark; cleared when the Session is disposed. */
export class SocialReadonlyRegistry {
  private readonly marks = new Map<string, SocialImportMark>()

  /**
   * @param sessionId - imported Session.
   * @param info - share provenance and read-only flag.
   */
  mark(sessionId: SessionId, info: SocialImportMark): void {
    this.marks.set(String(sessionId), info)
  }

  /**
   * @param sessionId - Session to clear.
   */
  clear(sessionId: SessionId): void {
    this.marks.delete(String(sessionId))
  }

  /**
   * @param sessionId - Session to query.
   * @returns whether prompt/write must be refused.
   */
  isReadonly(sessionId: SessionId): boolean {
    return this.marks.has(String(sessionId))
  }

  /**
   * @param sessionId - Session to query.
   * @returns mark when present.
   */
  get(sessionId: SessionId): SocialImportMark | undefined {
    return this.marks.get(String(sessionId))
  }

  /** Drop every mark (plugin dispose / HMR). */
  clearAll(): void {
    this.marks.clear()
  }
}
