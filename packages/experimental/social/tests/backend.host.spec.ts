import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import { MockSocialBackend } from '../src/backend.ts'
import { sanitizeSessionEvents } from '../src/sanitize.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session'

const alice = brandString<AccountUserId>('user-alice')
const bob = brandString<AccountUserId>('user-bob')

describe('MockSocialBackend', () => {
  const stores: MockSocialBackend[] = []
  afterEach(() => { stores.length = 0 })

  it('requests, accepts, and lists friends with peer profiles', async () => {
    const backend = new MockSocialBackend()
    stores.push(backend)
    backend.upsert({ id: alice, name: 'Alice', avatarUrl: null })
    backend.upsert({ id: bob, name: 'Bob', avatarUrl: null })
    const pending = await backend.requestFriend(alice, bob)
    expect(pending.statusForViewer).toBe('pending_out')
    expect((await backend.listPending(bob))[0]?.statusForViewer).toBe('pending_in')
    const accepted = await backend.acceptFriend(bob, alice)
    expect(accepted.statusForViewer).toBe('accepted')
    expect(await backend.listFriends(alice)).toHaveLength(1)
    expect(backend.get(bob)?.name).toBe('Bob')
  })

  it('auto-accepts when both sides request', async () => {
    const backend = new MockSocialBackend()
    await backend.requestFriend(alice, bob)
    const edge = await backend.requestFriend(bob, alice)
    expect(edge.statusForViewer).toBe('accepted')
  })

  it('stores shares only for the inbox recipient and marks opened', async () => {
    const backend = new MockSocialBackend()
    await backend.requestFriend(alice, bob)
    await backend.acceptFriend(bob, alice)
    const share = await backend.putShare({
      fromId: alice,
      toId: bob,
      title: 'Demo',
      createdAt: 1,
      sessionFormatVersion: 1,
      events: [],
    })
    expect(await backend.listInbox(alice)).toHaveLength(0)
    expect(await backend.listInbox(bob)).toHaveLength(1)
    const opened = await backend.markOpened(bob, share.shareId, 99)
    expect(opened.openedAt).toBe(99)
  })

  it('persists to a JSON file when a path is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-social-'))
    const path = join(dir, 'mock-store.json')
    const backend = new MockSocialBackend(path)
    await backend.requestFriend(alice, bob)
    const raw = JSON.parse(await readFile(path, 'utf8')) as { friendships: unknown[] }
    expect(raw.friendships).toHaveLength(1)
    const reloaded = new MockSocialBackend(path)
    await reloaded.load()
    expect(await reloaded.listPending(bob)).toHaveLength(1)
  })
})

describe('sanitizeSessionEvents', () => {
  it('strips sourcePath and token-like keys while keeping other fields', () => {
    const event = {
      type: 'user/message',
      seq: SessionSeq(1),
      time: 1,
      data: {
        id: 'm1',
        content: [{ type: 'text', text: 'hi' }],
        sourcePath: '/secret/path',
        token: 'leak',
        nested: { authToken: 'x', keep: true },
      },
    } as unknown as SessionEvent
    const [clean] = sanitizeSessionEvents([event])
    const data = clean?.data as Record<string, unknown>
    expect(data.sourcePath).toBeUndefined()
    expect(data.token).toBeUndefined()
    expect((data.nested as Record<string, unknown>).authToken).toBeUndefined()
    expect((data.nested as Record<string, unknown>).keep).toBe(true)
  })
})
