/** Friendship graph and share snapshot store used by the Social Host service. */

import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FriendshipStatus, PeerProfile, SocialShareId } from './types.ts'

/** Undirected friendship edge as seen by one viewer. */
export interface FriendshipRecord {
  readonly a: AccountUserId
  readonly b: AccountUserId
  readonly statusForViewer: FriendshipStatus
  readonly updatedAt: number
}

/** Durable share payload including session events. */
export interface ShareRecord {
  readonly shareId: SocialShareId
  readonly fromId: AccountUserId
  readonly toId: AccountUserId
  readonly title: string
  readonly createdAt: number
  readonly sessionFormatVersion: number
  readonly events: readonly SessionEvent[]
  readonly openedAt: number | null
}

/** Replaceable social persistence face. */
export interface SocialBackend {
  requestFriend(from: AccountUserId, to: AccountUserId): Promise<FriendshipRecord>
  acceptFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord>
  rejectFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord>
  listFriends(viewer: AccountUserId): Promise<readonly FriendshipRecord[]>
  listPending(viewer: AccountUserId): Promise<readonly FriendshipRecord[]>
  getFriendship(a: AccountUserId, b: AccountUserId): Promise<FriendshipRecord | null>
  putShare(input: Omit<ShareRecord, 'shareId' | 'openedAt'> & { openedAt?: null }): Promise<ShareRecord>
  getShare(shareId: SocialShareId): Promise<ShareRecord | null>
  listInbox(viewer: AccountUserId): Promise<readonly ShareRecord[]>
  markOpened(viewer: AccountUserId, shareId: SocialShareId, at: number): Promise<ShareRecord>
}

/** Peer display cache beside the friendship store. */
export interface PeerProfileStore {
  get(id: AccountUserId): PeerProfile | undefined
  upsert(profile: PeerProfile): void
  list(): readonly PeerProfile[]
}

interface StoredEdge {
  readonly lo: string
  readonly hi: string
  state: 'pending' | 'accepted' | 'rejected'
  requester: string
  updatedAt: number
}

interface StoreFile {
  profiles: Record<string, PeerProfile>
  friendships: StoredEdge[]
  shares: ShareRecord[]
}

function orderedPair(a: AccountUserId, b: AccountUserId): { lo: string; hi: string } {
  const left = String(a)
  const right = String(b)
  return left < right ? { lo: left, hi: right } : { lo: right, hi: left }
}

function viewEdge(edge: StoredEdge, viewer: AccountUserId): FriendshipRecord {
  const a = brandString<AccountUserId>(edge.lo)
  const b = brandString<AccountUserId>(edge.hi)
  const viewerKey = String(viewer)
  let statusForViewer: FriendshipStatus
  if (edge.state === 'accepted') statusForViewer = 'accepted'
  else if (edge.state === 'rejected') statusForViewer = 'rejected'
  else statusForViewer = edge.requester === viewerKey ? 'pending_out' : 'pending_in'
  return { a, b, statusForViewer, updatedAt: edge.updatedAt }
}

/**
 * In-memory (optional file-backed) SocialBackend for single-Host Mock acceptance.
 */
export class MockSocialBackend implements SocialBackend, PeerProfileStore {
  private profiles = new Map<string, PeerProfile>()
  private edges = new Map<string, StoredEdge>()
  private shares = new Map<string, ShareRecord>()
  private writeChain: Promise<void> = Promise.resolve()

  /**
   * @param storePath - optional JSON path under `$DSH_HOME`; omit for memory-only tests.
   */
  constructor(private readonly storePath?: string) {}

  /**
   * Load persisted Mock state when a store path is configured.
   */
  async load(): Promise<void> {
    if (this.storePath === undefined) return
    try {
      const raw = JSON.parse(await readFile(this.storePath, 'utf8')) as StoreFile
      this.profiles = new Map(Object.entries(raw.profiles ?? {}))
      this.edges = new Map((raw.friendships ?? []).map(edge => [`${edge.lo}\0${edge.hi}`, edge]))
      this.shares = new Map((raw.shares ?? []).map(share => [String(share.shareId), share]))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }

  get(id: AccountUserId): PeerProfile | undefined {
    return this.profiles.get(String(id))
  }

  upsert(profile: PeerProfile): void {
    this.profiles.set(String(profile.id), profile)
    void this.persist()
  }

  list(): readonly PeerProfile[] {
    return [...this.profiles.values()]
  }

  async requestFriend(from: AccountUserId, to: AccountUserId): Promise<FriendshipRecord> {
    if (from === to) throw new Error('cannot friend yourself')
    const { lo, hi } = orderedPair(from, to)
    const key = `${lo}\0${hi}`
    const existing = this.edges.get(key)
    const now = Date.now()
    if (existing?.state === 'accepted') return viewEdge(existing, from)
    if (existing?.state === 'pending' && existing.requester !== String(from)) {
      existing.state = 'accepted'
      existing.updatedAt = now
      await this.persist()
      return viewEdge(existing, from)
    }
    const edge: StoredEdge = {
      lo, hi, state: 'pending', requester: String(from), updatedAt: now,
    }
    this.edges.set(key, edge)
    await this.persist()
    return viewEdge(edge, from)
  }

  async acceptFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord> {
    const edge = this.requirePendingIn(viewer, peer)
    edge.state = 'accepted'
    edge.updatedAt = Date.now()
    await this.persist()
    return viewEdge(edge, viewer)
  }

  async rejectFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord> {
    const edge = this.requirePendingIn(viewer, peer)
    edge.state = 'rejected'
    edge.updatedAt = Date.now()
    await this.persist()
    return viewEdge(edge, viewer)
  }

  async listFriends(viewer: AccountUserId): Promise<readonly FriendshipRecord[]> {
    return [...this.edges.values()]
      .filter(edge => edge.state === 'accepted' && (edge.lo === String(viewer) || edge.hi === String(viewer)))
      .map(edge => viewEdge(edge, viewer))
  }

  async listPending(viewer: AccountUserId): Promise<readonly FriendshipRecord[]> {
    return [...this.edges.values()]
      .filter(edge => edge.state === 'pending' && edge.requester !== String(viewer)
        && (edge.lo === String(viewer) || edge.hi === String(viewer)))
      .map(edge => viewEdge(edge, viewer))
  }

  async getFriendship(a: AccountUserId, b: AccountUserId): Promise<FriendshipRecord | null> {
    const { lo, hi } = orderedPair(a, b)
    const edge = this.edges.get(`${lo}\0${hi}`)
    return edge === undefined ? null : viewEdge(edge, a)
  }

  async putShare(input: Omit<ShareRecord, 'shareId' | 'openedAt'> & { openedAt?: null }): Promise<ShareRecord> {
    const shareId = brandString<SocialShareId>(`shr_${randomUUID()}`)
    const record: ShareRecord = { ...input, shareId, openedAt: null }
    this.shares.set(String(shareId), record)
    await this.persist()
    return record
  }

  async getShare(shareId: SocialShareId): Promise<ShareRecord | null> {
    return this.shares.get(String(shareId)) ?? null
  }

  async listInbox(viewer: AccountUserId): Promise<readonly ShareRecord[]> {
    return [...this.shares.values()]
      .filter(share => share.toId === viewer)
      .sort((left, right) => right.createdAt - left.createdAt)
  }

  async markOpened(viewer: AccountUserId, shareId: SocialShareId, at: number): Promise<ShareRecord> {
    const current = this.shares.get(String(shareId))
    if (current === undefined || current.toId !== viewer) throw new Error('share not found')
    const next = { ...current, openedAt: at }
    this.shares.set(String(shareId), next)
    await this.persist()
    return next
  }

  private requirePendingIn(viewer: AccountUserId, peer: AccountUserId): StoredEdge {
    const { lo, hi } = orderedPair(viewer, peer)
    const edge = this.edges.get(`${lo}\0${hi}`)
    if (edge === undefined || edge.state !== 'pending' || edge.requester === String(viewer)) {
      throw new Error('no pending inbound request')
    }
    return edge
  }

  private persist(): Promise<void> {
    if (this.storePath === undefined) return Promise.resolve()
    const path = this.storePath
    this.writeChain = this.writeChain.then(async () => {
      const body: StoreFile = {
        profiles: Object.fromEntries(this.profiles),
        friendships: [...this.edges.values()],
        shares: [...this.shares.values()],
      }
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
    })
    return this.writeChain
  }
}
