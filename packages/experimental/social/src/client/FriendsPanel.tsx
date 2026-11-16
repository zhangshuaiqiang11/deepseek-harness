/** Sidebar friends / pending / inbox dialog. */
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal, Tooltip, useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HocShare, InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SlotMap,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { FriendshipView, InboxItem, PeerProfile } from '../types.ts'
import css from './FriendsPanel.module.css'

/** Injected Remote wrappers from mount. */
export interface SocialFriendsInjected {
  readonly refreshLists: (signal: AbortSignal) => Promise<{
    friends: readonly FriendshipView[]
    pending: readonly FriendshipView[]
    inbox: readonly InboxItem[]
    signedOut: boolean
    self: PeerProfile | null
  }>
  readonly requestFriend: (peerId: string, signal: AbortSignal) => Promise<void>
  readonly acceptFriend: (peerId: string, signal: AbortSignal) => Promise<void>
  readonly rejectFriend: (peerId: string, signal: AbortSignal) => Promise<void>
  readonly openShare: (shareId: string, workspaceId: string, signal: AbortSignal) => Promise<void>
}

/** Props composed by the `sidebar.session.action` slot. */
export type FriendsPanelProps =
  PropsRuntime<'sidebar.session.action'>
  & HocShare<SlotMap['sidebar.session.action']>
  & PropsRenderFactories
  & InjectFace<SocialFriendsInjected>
  & PropsLocale<'social'>

type Tab = 'friends' | 'pending' | 'inbox'

/**
 * New-session row layer: friends dialog trigger.
 * @param props - slot props plus social inject callbacks.
 */
export function FriendsPanelAction(props: FriendsPanelProps) {
  const { wide, t, children } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      {children}
      <Tooltip label={t('action.label')} delayMs={500} side={wide ? 'bottom' : 'right'}>
        <button
          type="button"
          className={clsx(css.trigger, wide && css.wide)}
          aria-label={t('action.label')}
          onClick={() => { setOpen(true) }}
        >
          {wide ? t('action.label') : 'Fr'}
        </button>
      </Tooltip>
      {open && <FriendsDialog {...props} onClose={() => { setOpen(false) }} />}
    </>
  )
}

function FriendsDialog(props: FriendsPanelProps & { onClose: () => void }) {
  const {
    t, onClose, refreshLists, requestFriend, acceptFriend, rejectFriend, openShare, useWorkspaces, useSessions,
  } = props
  const [tab, setTab] = useState<Tab>('friends')
  const [friends, setFriends] = useState<readonly FriendshipView[]>([])
  const [pending, setPending] = useState<readonly FriendshipView[]>([])
  const [inbox, setInbox] = useState<readonly InboxItem[]>([])
  const [self, setSelf] = useState<PeerProfile | null>(null)
  const [peerId, setPeerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const selfId = self === null ? '' : String(self.id)
  const copy = useClipboardCopy(selfId)
  const workspaces = useWorkspaces(state => state.items)
  const currentSessionId = useSessions(state => Object.values(state.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id)
  const workspaceId = workspaces.find(workspace => currentSessionId !== undefined
    && workspace.sessionIds.includes(currentSessionId))?.workspaceId
    ?? workspaces[0]?.workspaceId

  const reload = useCallback(async (signal: AbortSignal) => {
    const next = await refreshLists(signal)
    setFriends(next.friends)
    setPending(next.pending)
    setInbox(next.inbox)
    setSignedOut(next.signedOut)
    setSelf(next.self)
  }, [refreshLists])

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(String(err instanceof Error ? err.message : err))
    })
    return () => { controller.abort() }
  }, [reload])

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController()
    setError(null)
    try {
      await action(controller.signal)
      await reload(controller.signal)
    } catch (err: unknown) {
      setError(mapError(t, err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dialog.title')}
      closeLabel={t('dialog.close')}
      className={css.dialog ?? ''}
    >
      <div className={css.body}>
        <p className={css.notice}>{t('dialog.mockNotice')}</p>
        <section className={css.howTo} aria-label={t('dialog.howToTitle')}>
          <p className={css.howToTitle}>{t('dialog.howToTitle')}</p>
          <ol className={css.howToList}>
            <li>{t('dialog.howTo.account')}</li>
            <li>{t('dialog.howTo.friend')}</li>
            <li>{t('dialog.howTo.share')}</li>
            <li>{t('dialog.howTo.receive')}</li>
          </ol>
        </section>
        <section className={css.self} aria-label={t('self.label')}>
          <span className={css.selfLabel}>{t('self.label')}</span>
          {signedOut || self === null
            ? <p className={css.selfHint}>{t('self.unsigned')}</p>
            : (
              <>
                <p className={css.selfHint}>{t('self.hint')}</p>
                <div className={css.selfRow}>
                  <code className={css.selfId}>{selfId}</code>
                  <Button variant="outline" onClick={copy.onCopy}>
                    {copy.copied ? t('self.copied') : t('self.copy')}
                  </Button>
                </div>
              </>
            )}
        </section>
        {signedOut && <p className={css.error}>{t('error.signed-out')}</p>}
        <div className={css.tabs} role="tablist">
          {(['friends', 'pending', 'inbox'] as const).map(id => (
            <button
              key={id}
              type="button"
              role="tab"
              className={clsx(css.tab, tab === id && css.tabActive)}
              aria-selected={tab === id}
              onClick={() => { setTab(id) }}
            >
              {t(`tab.${id}`)}
            </button>
          ))}
        </div>
        {error && <p className={css.error}>{error}</p>}
        {tab === 'friends' && (
          <>
            <div className={css.add}>
              <div className={css.addRow}>
                <input
                  value={peerId}
                  placeholder={t('friends.peerPlaceholder')}
                  onChange={(event) => { setPeerId(event.target.value) }}
                />
                <Button
                  variant="primary"
                  disabled={signedOut || peerId.trim() === ''}
                  onClick={() => { void run(signal => requestFriend(peerId, signal)).then(() => { setPeerId('') }) }}
                >
                  {t('friends.request')}
                </Button>
              </div>
              <p className={css.selfHint}>{t('friends.peerHint')}</p>
            </div>
            <div className={css.list}>
              {friends.length === 0
                ? <p className={css.empty}>{t('friends.empty')}</p>
                : friends.map(friend => (
                  <div key={String(friend.peerId)} className={css.row}>
                    <div className={css.peer}>
                      <span className={css.name}>{friend.name || String(friend.peerId)}</span>
                      <span className={css.id}>{String(friend.peerId)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === 'pending' && (
          <div className={css.list}>
            {pending.length === 0
              ? <p className={css.empty}>{t('pending.empty')}</p>
              : pending.map(item => (
                <div key={String(item.peerId)} className={css.row}>
                  <div className={css.peer}>
                    <span className={css.name}>{item.name || String(item.peerId)}</span>
                    <span className={css.id}>{String(item.peerId)}</span>
                  </div>
                  <div className={css.actions}>
                    <Button variant="primary" onClick={() => {
                      void run(signal => acceptFriend(String(item.peerId), signal))
                    }}>{t('friends.accept')}</Button>
                    <Button variant="outline" onClick={() => {
                      void run(signal => rejectFriend(String(item.peerId), signal))
                    }}>{t('friends.reject')}</Button>
                  </div>
                </div>
              ))}
          </div>
        )}
        {tab === 'inbox' && (
          <>
            <p className={css.selfHint}>{t('inbox.hint')}</p>
            <div className={css.list}>
              {inbox.length === 0
                ? <p className={css.empty}>{t('inbox.empty')}</p>
                : inbox.map(item => (
                  <div key={String(item.shareId)} className={css.row}>
                    <div className={css.peer}>
                      <span className={css.name}>{item.title}</span>
                      <span className={css.id}>{item.from.name || String(item.from.id)}</span>
                    </div>
                    <Button
                      variant="primary"
                      disabled={workspaceId === undefined}
                      onClick={() => {
                        if (workspaceId === undefined) {
                          setError(t('share.needWorkspace'))
                          return
                        }
                        void run(async (signal) => {
                          await openShare(String(item.shareId), String(workspaceId), signal)
                          onClose()
                        })
                      }}
                    >
                      {item.openedAt == null ? t('inbox.open') : t('inbox.opened')}
                    </Button>
                  </div>
                ))}
            </div>
          </>
        )}
        <Button variant="outline" onClick={onClose}>{t('dialog.close')}</Button>
      </div>
    </Modal>
  )
}

function mapError(t: FriendsPanelProps['t'], err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
  const key = code.startsWith('social/') ? `error.${code.slice('social/'.length)}` as const : null
  if (key && key in {
    'error.signed-out': 1, 'error.not-friends': 1, 'error.share-not-found': 1,
    'error.snapshot-too-large': 1, 'error.no-workspace': 1, 'error.readonly': 1, 'error.invalid-peer': 1,
  }) return t(key as 'error.signed-out')
  return t('error.unknown', { message: err instanceof Error ? err.message : String(err) })
}
