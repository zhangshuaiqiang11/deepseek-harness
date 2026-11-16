/** Browser-safe social wire types and Remote error details. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Opaque share identity. */
export type SocialShareId = Branded<'SocialShareId'>

/** Friendship edge as seen by one viewer. */
export type FriendshipStatus = 'pending_out' | 'pending_in' | 'accepted' | 'rejected'

/** Peer display fields cached beside the friendship edge. */
export interface PeerProfile {
  readonly id: AccountUserId
  readonly name: string | null
  readonly avatarUrl: string | null
}

/** Client-facing friendship row. */
export interface FriendshipView {
  readonly peerId: AccountUserId
  readonly status: FriendshipStatus
  readonly updatedAt: number
  readonly name: string | null
  readonly avatarUrl: string | null
}

/** Share metadata without event payload. */
export interface ShareSnapshotMeta {
  readonly shareId: SocialShareId
  readonly fromId: AccountUserId
  readonly toId: AccountUserId
  readonly title: string
  readonly createdAt: number
  readonly format: 'session-events-v1'
}

/** Inbox row for the receiver. */
export interface InboxItem {
  readonly shareId: SocialShareId
  readonly from: PeerProfile
  readonly title: string
  readonly createdAt: number
  readonly openedAt: number | null
}

/** Outcome of getSelf. */
export type SocialSelf =
  | { readonly status: 'signed-out' }
  | { readonly status: 'ready'; readonly profile: PeerProfile }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'social/signed-out': {}
    'social/not-friends': {}
    'social/share-not-found': {}
    'social/snapshot-too-large': {}
    'social/no-workspace': {}
    'social/readonly': {}
    'social/invalid-peer': {}
  }
}

/** Re-export Session types used on the Host share path. */
export type { SessionEvent, SessionId, AccountUserId }
