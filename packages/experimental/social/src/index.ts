/**
 * Host Social service: DeepSeek-account friends, Mock (or future HTTP) share
 * inbox, and read-only Session import. Single-Host Mock acceptance only until
 * an HttpSocialBackend exists.
 * @module @deepseek-ai/dsh-social
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AccountClientMetadata, AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session-query'
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { flushLiveSessionLog } from '@deepseek-ai/dsh-session-log-export'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { MockSocialBackend } from './backend.ts'
import type { FriendshipRecord, SocialBackend } from './backend.ts'
import { importShareSession } from './import-session.ts'
import { SocialReadonlyRegistry } from './readonly.ts'
import { sanitizeSessionEvents, stripAttachmentBytes } from './sanitize.ts'
import type {
  FriendshipView, InboxItem, PeerProfile, ShareSnapshotMeta, SocialSelf, SocialShareId,
} from './types.ts'

export type {
  FriendshipStatus, FriendshipView, InboxItem, PeerProfile, ShareSnapshotMeta, SocialSelf, SocialShareId,
} from './types.ts'
export type { FriendshipRecord, ShareRecord, SocialBackend, PeerProfileStore } from './backend.ts'
export { MockSocialBackend } from './backend.ts'
export { SocialReadonlyRegistry } from './readonly.ts'
export { sanitizeSessionEvents, stripAttachmentBytes } from './sanitize.ts'
export { importShareSession } from './import-session.ts'

/** Plugin configuration. */
export interface Config {
  /** Persistence provider; only `mock` ships in MVP. */
  backend: 'mock'
  /** Mock JSON path; default `$DSH_HOME/social/mock-store.json` via cordis expression. */
  mockStorePath: string | null
  /** Soft cap on JSON-serialized share events. */
  maxSnapshotBytes: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Friends, share inbox, and read-only import. */
    social: SocialService
  }
}

/**
 * Cordis Social Host service and Typert `social` Remote namespace.
 */
export default class SocialService extends TypertRemoteService {
  static inject = [
    'typert',
    'deepseekAccount',
    'sessionQuery',
    'sessionPersistence',
    'workspaceRegistry',
  ]

  static Config: Schema<Config> = Schema.object({
    backend: Schema.union(['mock' as const]).default('mock')
      .description('Social persistence provider. MVP ships mock only; cross-install needs a future HTTP backend.'),
    mockStorePath: Schema.union([Schema.string().role('path'), Schema.const(null)]).default(null)
      .description('JSON file for the Mock store. Null keeps an in-memory store (tests).'),
    maxSnapshotBytes: Schema.natural().min(1).default(8 * 1024 * 1024)
      .description('Maximum JSON size of a shared session snapshot.'),
  })

  private readonly backend: SocialBackend & MockSocialBackend
  private readonly readonlyRegistry = new SocialReadonlyRegistry()
  private ready: Promise<void>

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'social', { namespace: 'social' })
    this.backend = new MockSocialBackend(config.mockStorePath ?? undefined)
    this.ready = this.backend.load()
    ctx.effect(() => () => {
      // Registry is process-local; clearing avoids stale marks across HMR.
      this.readonlyRegistry.clearAll()
    }, 'social: readonly registry')
    // Reject model steps on imported shares. Owner session/prompt still needs
    // Client composer hiding; this blocks agent execution if a prompt slips through.
    ctx.effect(() => ctx.on('agent/pre-step', async (event, next) => {
      if (this.readonlyRegistry.isReadonly(event.agent.session.id)) {
        return { kind: 'reject' as const }
      }
      return next()
    }), 'social: readonly pre-step gate')
  }

  /**
   * Refuse prompt/write for Sessions imported from a social share.
   * Owner Peers still hit this Host gate (remote-access always allows the owner).
   * @param sessionId - Session about to accept a write.
   */
  assertCanPrompt(sessionId: SessionId): void {
    if (this.readonlyRegistry.isReadonly(sessionId)) {
      throw new RemoteError('social/readonly', 'Shared conversations are read-only', {})
    }
  }

  /**
   * @param sessionId - Session to query.
   * @returns whether the Session was imported as a social share.
   */
  isReadonlySession(sessionId: SessionId): boolean {
    return this.readonlyRegistry.isReadonly(sessionId)
  }

  /**
   * Browser-facing read-only probe for Composer hiding.
   * @param sessionId - Session id string.
   * @param signal - cancellation.
   */
  @Remote
  sessionIsReadonly(sessionId: string, signal: AbortSignal): boolean {
    signal.throwIfAborted()
    return this.readonlyRegistry.isReadonly(brandString<SessionId>(sessionId))
  }

  /**
   * @param client - UI identity for Platform profile headers.
   * @param signal - Remote cancellation.
   */
  @Remote
  async getSelf(client: AccountClientMetadata, signal: AbortSignal): Promise<SocialSelf> {
    signal.throwIfAborted()
    await this.ready
    const profile = await this.ctx.deepseekAccount.getProfile(client)
    if (profile?.status !== 'ready' || profile.value.id == null) return { status: 'signed-out' }
    const peer: PeerProfile = {
      id: profile.value.id,
      name: profile.value.name,
      avatarUrl: profile.value.avatarUrl ?? null,
    }
    this.backend.upsert(peer)
    return { status: 'ready', profile: peer }
  }

  /**
   * @param client - UI identity.
   * @param peerId - target account id (paste path; no search API).
   * @param signal - cancellation.
   */
  @Remote
  async requestFriend(
    client: AccountClientMetadata, peerId: string, signal: AbortSignal,
  ): Promise<FriendshipView> {
    signal.throwIfAborted()
    const from = await this.requireUserId(client)
    const to = this.parsePeerId(peerId)
    const edge = await this.backend.requestFriend(from, to)
    return this.friendshipView(from, edge)
  }

  /** @param client - UI identity. @param peerId - requester to accept. @param signal - cancellation. */
  @Remote
  async acceptFriend(
    client: AccountClientMetadata, peerId: string, signal: AbortSignal,
  ): Promise<FriendshipView> {
    signal.throwIfAborted()
    const viewer = await this.requireUserId(client)
    const peer = this.parsePeerId(peerId)
    return this.friendshipView(viewer, await this.backend.acceptFriend(viewer, peer))
  }

  /** @param client - UI identity. @param peerId - requester to reject. @param signal - cancellation. */
  @Remote
  async rejectFriend(
    client: AccountClientMetadata, peerId: string, signal: AbortSignal,
  ): Promise<FriendshipView> {
    signal.throwIfAborted()
    const viewer = await this.requireUserId(client)
    const peer = this.parsePeerId(peerId)
    return this.friendshipView(viewer, await this.backend.rejectFriend(viewer, peer))
  }

  /** @param client - UI identity. @param signal - cancellation. */
  @Remote
  async listFriends(client: AccountClientMetadata, signal: AbortSignal): Promise<readonly FriendshipView[]> {
    signal.throwIfAborted()
    const viewer = await this.requireUserId(client)
    return (await this.backend.listFriends(viewer)).map(edge => this.friendshipView(viewer, edge))
  }

  /** @param client - UI identity. @param signal - cancellation. */
  @Remote
  async listPending(client: AccountClientMetadata, signal: AbortSignal): Promise<readonly FriendshipView[]> {
    signal.throwIfAborted()
    const viewer = await this.requireUserId(client)
    return (await this.backend.listPending(viewer)).map(edge => this.friendshipView(viewer, edge))
  }

  /**
   * @param client - UI identity.
   * @param sessionId - local Session to snapshot.
   * @param toId - accepted friend.
   * @param signal - cancellation.
   */
  @Remote
  async shareSession(
    client: AccountClientMetadata, sessionId: string, toId: string, signal: AbortSignal,
  ): Promise<ShareSnapshotMeta> {
    signal.throwIfAborted()
    await this.ready
    const fromId = await this.requireUserId(client)
    const peer = this.parsePeerId(toId)
    const edge = await this.backend.getFriendship(fromId, peer)
    if (edge?.statusForViewer !== 'accepted') {
      throw new RemoteError('social/not-friends', 'Share requires an accepted friendship', {})
    }
    const id = brandString<SessionId>(sessionId)
    await flushLiveSessionLog({ sessions: this.ctx.get('sessions') }, id, signal)
    const snapshot = await this.ctx.sessionQuery.readSession(id)
    const sanitized = stripAttachmentBytes(sanitizeSessionEvents(snapshot.events))
    const body = JSON.stringify(sanitized)
    if (Buffer.byteLength(body, 'utf8') > this.config.maxSnapshotBytes) {
      throw new RemoteError('social/snapshot-too-large', 'Session snapshot exceeds the share size limit', {})
    }
    const title = foldSessionTitle(sanitized)?.title || 'Untitled Session'
    const record = await this.backend.putShare({
      fromId,
      toId: peer,
      title,
      createdAt: Date.now(),
      sessionFormatVersion: SESSION_FORMAT_VERSION,
      events: sanitized,
      openedAt: null,
    })
    return {
      shareId: record.shareId,
      fromId: record.fromId,
      toId: record.toId,
      title: record.title,
      createdAt: record.createdAt,
      format: 'session-events-v1',
    }
  }

  /** @param client - UI identity. @param signal - cancellation. */
  @Remote
  async listInbox(client: AccountClientMetadata, signal: AbortSignal): Promise<readonly InboxItem[]> {
    signal.throwIfAborted()
    const viewer = await this.requireUserId(client)
    const rows = await this.backend.listInbox(viewer)
    return rows.map(share => ({
      shareId: share.shareId,
      from: this.peerProfile(share.fromId),
      title: share.title,
      createdAt: share.createdAt,
      openedAt: share.openedAt,
    }))
  }

  /**
   * Import a received share into the named Workspace as a read-only Session.
   * @param client - UI identity.
   * @param shareId - inbox item.
   * @param workspaceId - currently selected Workspace.
   * @param signal - cancellation.
   */
  @Remote
  async openShare(
    client: AccountClientMetadata, shareId: string, workspaceId: string, signal: AbortSignal,
  ): Promise<{ sessionId: SessionId }> {
    signal.throwIfAborted()
    await this.ready
    const viewer = await this.requireUserId(client)
    const record = await this.backend.getShare(brandString<SocialShareId>(shareId))
    if (record == null || record.toId !== viewer) {
      throw new RemoteError('social/share-not-found', 'Share not found', {})
    }
    const workspace = this.ctx.workspaceRegistry.get(brandString<WorkspaceId>(workspaceId))
    if (workspace === undefined || !isAbsolute(workspace.path)) {
      throw new RemoteError('social/no-workspace', 'Select a workspace before opening a shared conversation', {})
    }
    const events = stripAttachmentBytes(sanitizeSessionEvents(record.events))
    let sessionId: SessionId | undefined
    try {
      sessionId = await importShareSession(
        this.ctx.sessionPersistence,
        workspace,
        events,
        signal,
        this.ctx.get('sessionProjectionCache'),
      )
      this.readonlyRegistry.mark(sessionId, { shareId: record.shareId, readOnly: true })
      await this.backend.markOpened(viewer, record.shareId, Date.now())
      return { sessionId }
    } catch (error) {
      if (sessionId !== undefined) this.readonlyRegistry.clear(sessionId)
      throw error
    }
  }

  private async requireUserId(client: AccountClientMetadata): Promise<AccountUserId> {
    await this.ready
    const profile = await this.ctx.deepseekAccount.getProfile(client)
    if (profile?.status !== 'ready' || profile.value.id == null) {
      throw new RemoteError('social/signed-out', 'Sign in with a DeepSeek account to use social features', {})
    }
    this.backend.upsert({
      id: profile.value.id,
      name: profile.value.name,
      avatarUrl: profile.value.avatarUrl ?? null,
    })
    return profile.value.id
  }

  private parsePeerId(peerId: string): AccountUserId {
    const trimmed = peerId.trim()
    if (trimmed === '') throw new RemoteError('social/invalid-peer', 'Peer id is required', {})
    return brandString<AccountUserId>(trimmed)
  }

  private friendshipView(viewer: AccountUserId, edge: FriendshipRecord): FriendshipView {
    const peerId = edge.a === viewer ? edge.b : edge.a
    const profile = this.peerProfile(peerId)
    return {
      peerId,
      status: edge.statusForViewer,
      updatedAt: edge.updatedAt,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    }
  }

  private peerProfile(id: AccountUserId): PeerProfile {
    return this.backend.get(id) ?? { id, name: null, avatarUrl: null }
  }
}
