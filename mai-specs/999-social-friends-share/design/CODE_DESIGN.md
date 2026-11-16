# 代码设计附录 — 999 好友与只读会话分享

> 返回：[TECH_DESIGN.md](./TECH_DESIGN.md) | 状态：设计示意（未实现） | 修订：按 [design_review](../review/design_review.md) 关闭 P0/P1/P2

## 1. 模块职责

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| `SocialBackend` | 好友边、快照、收件箱 | 无 Cordis |
| `PeerProfileStore` | peerId → name/avatarUrl 缓存（Mock 可持久化） | Backend 文件或并列 store |
| `Social` Host | 账号、flush/读、create(seed) 导入、只读闸门、Remote | account、sessionQuery、sessions、export flush 辅助 |
| `SocialReadonlyRegistry` | sessionId → share 只读标记 | 随 Session 生命周期 |
| Client UI | slots + Remote | social / account Remote、workspace |

## 2. SocialBackend 与状态机

```ts
// 设计示意 — 验证状态：未实现
export type FriendshipStatus = 'pending_out' | 'pending_in' | 'accepted' | 'rejected'
// MVP 不含 blocked

export interface FriendshipRecord {
  readonly a: AccountUserId
  readonly b: AccountUserId
  readonly statusForViewer: FriendshipStatus
  readonly updatedAt: number
}

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

export interface SocialBackend {
  requestFriend(from: AccountUserId, to: AccountUserId): Promise<FriendshipRecord>
  acceptFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord>
  rejectFriend(viewer: AccountUserId, peer: AccountUserId): Promise<FriendshipRecord>
  listFriends(viewer: AccountUserId): Promise<readonly FriendshipRecord[]>
  listPending(viewer: AccountUserId): Promise<readonly FriendshipRecord[]>
  /** 任意状态边或 null（含 pending/rejected）；调用方检查 statusForViewer。 */
  getFriendship(a: AccountUserId, b: AccountUserId): Promise<FriendshipRecord | null>
  putShare(input: Omit<ShareRecord, 'shareId' | 'openedAt'> & { openedAt?: null }): Promise<ShareRecord>
  getShare(shareId: SocialShareId): Promise<ShareRecord | null>
  listInbox(viewer: AccountUserId): Promise<readonly ShareRecord[]>
  markOpened(viewer: AccountUserId, shareId: SocialShareId, at: number): Promise<ShareRecord>
}

export interface PeerProfileStore {
  get(id: AccountUserId): PeerProfile | undefined
  upsert(profile: PeerProfile): void
}
```

### 2.1 好友状态机

```text
(none) --request(A→B)--> pending_out(A) / pending_in(B)
pending_in(B) --accept(B)--> accepted(A,B)
pending_in(B) --reject(B)--> rejected（可再次 request 覆盖为 pending）
已有反向 pending 时 request --> accepted（相遇自动结友）
accepted -- MVP 无 unfriend --> 保持
```

不变量：`from !== to`；已 `accepted` 的 `requestFriend` 幂等返回 accepted；无向键 `lo/hi` 存储。

### 2.2 分享不变量

- Host 在 `putShare` 前确认 `getFriendship` 的 `statusForViewer === 'accepted'`（对 from 视角）。
- `getShare` / `markOpened`：仅 `viewer === toId`。
- 事件经 `sanitizeSessionEvents` + `stripAttachmentBytes`。

### 2.3 sanitize 清单（MVP 最小）

```ts
// 设计示意
function sanitizeSessionEvents(events: readonly SessionEvent[]): SessionEvent[] {
  // 深克隆后：
  // 1. 删除/清空已知本地绝对路径元数据（若事件或嵌套对象出现 sourcePath、绝对 cwd 泄露字段——保留 Session header 所需的逻辑 cwd 由导入侧 meta.cwd 重写，不信任快照内宿主路径）。
  // 2. 不嵌入附件字节；attachment id 引用保留，打开侧缺失资源按既有失败展示。
  // 3. 不得出现 Host grant / token 字符串（若误入自定义字段则剔除该键）。
  return structuredClone(events) as SessionEvent[]
}
```

实现 PR 用单测钉死：含假 `sourcePath` / 假 token 字段的夹具经 sanitize 后不出现。

## 3. Host：分享与导入（原 P0）

```ts
// 设计示意 — 验证状态：未实现
export class Social {
  constructor(
    private ctx: Context,
    private backend: SocialBackend,
    private profiles: PeerProfileStore,
    private readonlyRegistry: SocialReadonlyRegistry,
    private config: SocialConfig,
  ) {}

  private async requireUserId(client: AccountClientMetadata): Promise<AccountUserId> { /* … */ }

  private friendshipView(viewer: AccountUserId, edge: FriendshipRecord): FriendshipView {
    const peerId = edge.a === viewer ? edge.b : edge.a
    const profile = this.profiles.get(peerId)
    return {
      peerId,
      status: edge.statusForViewer,
      updatedAt: edge.updatedAt,
      name: profile?.name ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    }
  }

  async listFriends(client: AccountClientMetadata): Promise<readonly FriendshipView[]> {
    const viewer = await this.requireUserId(client)
    const edges = await this.backend.listFriends(viewer)
    return edges.map(edge => this.friendshipView(viewer, edge))
  }

  async shareSession(client: AccountClientMetadata, sessionId: SessionId, toId: AccountUserId) {
    const fromId = await this.requireUserId(client)
    const edge = await this.backend.getFriendship(fromId, toId)
    if (edge?.statusForViewer !== 'accepted') {
      throw new HarnessError('SOCIAL_NOT_FRIENDS', 'Share requires an accepted friendship')
    }
    await flushLiveSessionLog(/* export-equivalent deps */, sessionId)
    const events = await this.ctx.sessionQuery.readSession(sessionId)
    const sanitized = stripAttachmentBytes(sanitizeSessionEvents(events))
    const body = JSON.stringify(sanitized)
    if (Buffer.byteLength(body, 'utf8') > this.config.maxSnapshotBytes) {
      throw new HarnessError('SOCIAL_SNAPSHOT_TOO_LARGE', 'Session snapshot exceeds the share size limit')
    }
    const record = await this.backend.putShare({
      fromId, toId,
      title: latestTitle(sanitized) ?? 'Untitled Session',
      createdAt: Date.now(),
      sessionFormatVersion: SESSION_FORMAT_VERSION,
      events: sanitized,
      openedAt: null,
    })
    return toMeta(record)
  }

  /**
   * Import share as a seeded Session under the receiver's current Workspace cwd.
   * @param resolveCurrentWorkspaceCwd - Host 注入：当前选中 Workspace 绝对路径或 null
   */
  async openShare(
    client: AccountClientMetadata,
    shareId: SocialShareId,
    resolveCurrentWorkspaceCwd: () => string | null,
  ): Promise<{ sessionId: SessionId }> {
    const viewer = await this.requireUserId(client)
    const record = await this.backend.getShare(shareId)
    if (record == null || record.toId !== viewer) {
      throw new HarnessError('SOCIAL_SHARE_NOT_FOUND', 'Share not found')
    }
    const cwd = resolveCurrentWorkspaceCwd()
    if (cwd == null || !isAbsolute(cwd)) {
      throw new HarnessError('SOCIAL_NO_WORKSPACE', 'Select a workspace before opening a shared conversation')
    }

    const seed = stripAttachmentBytes(sanitizeSessionEvents(record.events))
    const sessionId = mintSessionId()
    let created: Session | undefined
    try {
      created = this.ctx.sessions.create(sessionId, {
        seed,
        meta: { cwd },
      })
      this.readonlyRegistry.mark(sessionId, { shareId: record.shareId, readOnly: true })
      // 若 Workspace catalog 需要显式挂入：调用既有 workspace 登记 API（实现时对接，失败则抛错走 catch）
      await this.backend.markOpened(viewer, shareId, Date.now())
      return { sessionId }
    } catch (error) {
      this.readonlyRegistry.clear(sessionId)
      created?.dispose?.() // 使用 SessionStore 既有移除/dispose 语义
      throw error
    }
  }

  /** Host prompt 闸门：owner 也拒绝。挂在 session/prompt 路径或等价写入入口。 */
  assertCanPrompt(sessionId: SessionId): void {
    if (this.readonlyRegistry.isReadonly(sessionId)) {
      throw new HarnessError('SOCIAL_READONLY', 'Shared conversations are read-only')
    }
  }
}

export interface SocialReadonlyRegistry {
  mark(sessionId: SessionId, info: { shareId: SocialShareId; readOnly: true }): void
  clear(sessionId: SessionId): void
  isReadonly(sessionId: SessionId): boolean
}
```

**与 remote-access 的关系**：不把 AC4 建立在非 owner policy 上。本地接收方是 owner；只读靠 `SocialReadonlyRegistry` + prompt 入口 `assertCanPrompt`。Client 另读 registry 投影或专用 Remote 字段隐藏 Composer。

**审查问题（已决）**

- 是否 flush？**是**，对齐 session-log-export。
- 是否用 `fork(live)`？**否**；快照来自 Backend，用 `create({ seed })`。
- Workspace？**当前选中 Workspace 的 cwd**；否则 `SOCIAL_NO_WORKSPACE`。

## 4. Remote 面（无 searchUsers）

```ts
// 设计示意
type SocialRemote = {
  getSelf(): Promise<{ status: 'signed-out' } | { status: 'ready'; profile: AccountProfile }>
  requestFriend(peerId: AccountUserId): Promise<FriendshipView>
  acceptFriend(peerId: AccountUserId): Promise<FriendshipView>
  rejectFriend(peerId: AccountUserId): Promise<FriendshipView>
  listFriends(): Promise<readonly FriendshipView[]>
  listPending(): Promise<readonly FriendshipView[]>
  shareSession(sessionId: SessionId, toId: AccountUserId): Promise<ShareSnapshotMeta>
  listInbox(): Promise<readonly InboxItem[]>
  openShare(shareId: SocialShareId): Promise<{ sessionId: SessionId }>
}
```

`FriendshipView` / `InboxItem.from` 由 Host 经 `PeerProfileStore` 拼装；Mock 夹具预置 profiles。

## 5. Mock 存储与验收

```json
{
  "profiles": {
    "user-a": { "id": "user-a", "name": "Alice", "avatarUrl": null },
    "user-b": { "id": "user-b", "name": "Bob", "avatarUrl": null }
  },
  "friendships": [
    { "lo": "user-a", "hi": "user-b", "state": "accepted", "requester": "user-a", "updatedAt": 0 }
  ],
  "shares": []
}
```

- 默认识别范围：**单进程 / 单 `$DSH_HOME`**。
- 测试：Fake `getProfile` 切换两个 `AccountUserId`，共享同一 Mock 文件或内存 store。
- **跨安装不在 Mock 验收内**；T6 前产品文案禁止暗示多机可用。

## 6. Client 挂载点

```ts
// 设计示意
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register({ name: 'sidebar.panellist' }, FriendsInboxEntry))

ctx.slots.inject('conversation.session.header.actions', () =>
  ctx.slots.register({ name: 'conversation.session.header.actions' }, ShareToFriendAction))
```

加好友 UI：单行粘贴 peerId；无搜索框。只读 Session：横幅 + 无发送键；仍以 Host 拒绝为 AC4 准绳。

## 7. Liveshare 边界

禁止依赖 liveshare / liveshare-protocol 传输。文案：「发送对话副本」vs Liveshare「实时分享」。

## 8. 省略边界

- 完整 Cordis apply、bundle YAML、i18n 全文、Workspace catalog 精确 API 名：实现按 cookbook 对接，失败语义已在 openShare 回滚中约定。
- HTTP Provider、unfriend、blocked、searchUsers、点赞、角色：不在 MVP 类型面。
