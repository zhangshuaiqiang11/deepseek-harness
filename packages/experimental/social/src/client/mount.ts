/** Mount social Remote contribution and sidebar / header UI. */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-social/remote'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { FriendsPanelAction } from './FriendsPanel.tsx'
import type { SocialFriendsInjected } from './FriendsPanel.tsx'
import { ShareToFriendAction } from './ShareAction.tsx'
import type { SocialShareInjected } from './ShareAction.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

export const inject = ['remote', 'slots', 'locale', 'sessions', 'workspaces', 'conversation']

function clientMetadata(ctx: Context): AccountClientMetadata {
  const locale = ctx.locale.getSnapshot().active
  const version = process.env.DSH_CLIENT_VERSION || '0.0.0-dev'
  return {
    version,
    locale,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

/**
 * Keep Composer blocked for Sessions the Host marked as social imports.
 * @param ctx - browser context with `remote.social` and `conversation.blocks`.
 */
function syncReadonlyComposer(ctx: Context): () => void {
  const tracked = new Set<string>()
  const t = ctx.locale.bind(NS)
  let generation = 0
  const publish = (): void => {
    const token = ++generation
    const snapshot = ctx.sessions.list.getSnapshot()
    const current = Object.values(snapshot.byId)
      .find(session => (session.retainedBy.mainView ?? 0) > 0)
    const controller = new AbortController()
    void (async () => {
      for (const id of tracked) {
        ctx.conversation.blocks.set(brandString<SessionId>(id), undefined)
      }
      tracked.clear()
      if (current === undefined) return
      const result = await ctx.remote.social.sessionIsReadonly(String(current.id), controller.signal)
      if (token !== generation || controller.signal.aborted) return
      if (!result.ok || !result.value) return
      tracked.add(String(current.id))
      ctx.conversation.blocks.set(current.id, { reason: t('readonly.banner') })
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) ctx.logger.warn('social: readonly composer sync failed', error)
    })
  }
  const stop = ctx.sessions.list.subscribe(publish)
  publish()
  return () => {
    generation += 1
    stop()
    for (const id of tracked) {
      ctx.conversation.blocks.set(brandString<SessionId>(id), undefined)
    }
    tracked.clear()
  }
}

/**
 * Register locale dictionaries and UI slots that call the `social` Remote.
 * @param ctx - browser context with `remote.social` mounted.
 */
function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'social: dictionaries')
  ctx.effect(() => syncReadonlyComposer(ctx), 'social: readonly composer')

  const friendsInjected: SocialFriendsInjected = {
    refreshLists: async (signal) => {
      const client = clientMetadata(ctx)
      const self = await ctx.remote.social.getSelf(client, signal)
      if (!self.ok) throw self.error
      if (self.value.status === 'signed-out') {
        return { friends: [], pending: [], inbox: [], signedOut: true, self: null }
      }
      const [friends, pending, inbox] = await Promise.all([
        ctx.remote.social.listFriends(client, signal),
        ctx.remote.social.listPending(client, signal),
        ctx.remote.social.listInbox(client, signal),
      ])
      if (!friends.ok) throw friends.error
      if (!pending.ok) throw pending.error
      if (!inbox.ok) throw inbox.error
      return {
        friends: friends.value,
        pending: pending.value,
        inbox: inbox.value,
        signedOut: false,
        self: self.value.profile,
      }
    },
    requestFriend: async (peerId, signal) => {
      const result = await ctx.remote.social.requestFriend(clientMetadata(ctx), peerId, signal)
      if (!result.ok) throw result.error
    },
    acceptFriend: async (peerId, signal) => {
      const result = await ctx.remote.social.acceptFriend(clientMetadata(ctx), peerId, signal)
      if (!result.ok) throw result.error
    },
    rejectFriend: async (peerId, signal) => {
      const result = await ctx.remote.social.rejectFriend(clientMetadata(ctx), peerId, signal)
      if (!result.ok) throw result.error
    },
    openShare: async (shareId, workspaceId, signal) => {
      const result = await ctx.remote.social.openShare(clientMetadata(ctx), shareId, workspaceId, signal)
      if (!result.ok) throw result.error
      await ctx.sessions.refresh().catch((error: unknown) => {
        ctx.logger.warn('social: session list refresh failed', error)
      })
      ctx.uiWorkspace.openSession(result.value.sessionId)
    },
  }

  ctx.slots.inject('sidebar.session.action', () => ctx.slots.register({
    name: 'sidebar.session.action',
    id: 'social-friends',
    locale: NS,
    inject: () => friendsInjected,
  }, FriendsPanelAction))

  const shareInjected: SocialShareInjected = {
    listFriends: async (signal) => {
      const result = await ctx.remote.social.listFriends(clientMetadata(ctx), signal)
      if (!result.ok) throw result.error
      return result.value
    },
    shareSession: async (sessionId, toId, signal) => {
      const result = await ctx.remote.social.shareSession(clientMetadata(ctx), sessionId, toId, signal)
      if (!result.ok) throw result.error
    },
    currentSessionId: () => {
      const sessions = ctx.sessions.list.getSnapshot()
      return Object.values(sessions.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
    },
  }

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'social-share',
    locale: NS,
    inject: () => shareInjected,
  }, ShareToFriendAction))
}

/**
 * Mount generated Remote then UI.
 * @param ctx - browser plugin context.
 * @param contribution - generated `social` Remote definitions.
 */
export async function mountSocial(
  ctx: Context, contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.social', ...inject.slice(1), 'uiWorkspace'], registerUi)
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}
