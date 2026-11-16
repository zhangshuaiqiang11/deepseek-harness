/** Conversation header action: share the current Session with an accepted friend. */
import { useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FriendshipView } from '../types.ts'
import css from './ShareAction.module.css'

/** Injected share helpers. */
export interface SocialShareInjected {
  readonly listFriends: (signal: AbortSignal) => Promise<readonly FriendshipView[]>
  readonly shareSession: (sessionId: string, toId: string, signal: AbortSignal) => Promise<void>
  readonly currentSessionId: () => string | undefined
}

export type ShareActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & InjectFace<SocialShareInjected>
  & PropsLocale<'social'>

/**
 * Header menu/button entry that opens a friend picker for read-only share.
 * @param props - header action slot props.
 */
export function ShareToFriendAction(props: ShareActionProps) {
  const { t, listFriends, shareSession, currentSessionId } = props
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<readonly FriendshipView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void listFriends(controller.signal).then(setFriends).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { controller.abort() }
  }, [open, listFriends])

  return (
    <>
      <Button variant="outline" onClick={() => { setOpen(true); setDone(false); setError(null) }}>
        {t('share.action')}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => { setOpen(false) }}
          title={t('share.title')}
          closeLabel={t('dialog.close')}
          className={css.dialog ?? ''}
        >
          <div className={css.body}>
            <p className={css.tip}>{t('share.tip')}</p>
            {error && <p>{error}</p>}
            {done && <p>{t('share.done')}</p>}
            {!done && friends.length === 0 && <p>{t('share.noFriends')}</p>}
            {!done && friends.map(friend => (
              <Button
                key={String(friend.peerId)}
                variant="primary"
                onClick={() => {
                  const sessionId = currentSessionId()
                  if (sessionId === undefined) {
                    setError(t('share.needSession'))
                    return
                  }
                  const controller = new AbortController()
                  void shareSession(sessionId, String(friend.peerId), controller.signal)
                    .then(() => { setDone(true) })
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : String(err))
                    })
                }}
              >
                {t('share.send')} — {friend.name || String(friend.peerId)}
              </Button>
            ))}
            <Button variant="outline" onClick={() => { setOpen(false) }}>{t('dialog.close')}</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
