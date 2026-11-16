---
description: "dsh-social 的 Host/Client 布局、Mock SocialBackend 与只读分享闸门。"
kind: "package-detail"
---

# @deepseek-ai/dsh-social 详情

[English](DETAIL.md) | 中文

## 布局

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | `SocialService`：Remote、分享/导入、`agent/pre-step` 拒绝、`sessionIsReadonly` |
| `src/backend.ts` | `SocialBackend` + `MockSocialBackend`（`$DSH_HOME/social/mock-store.json`） |
| `src/peer-profile.ts` | 好友 / 收件箱标签的 `getProfile` 缓存 |
| `src/sanitize.ts` | 分享载荷的仅文本事件过滤 |
| `src/readonly-registry.ts` | 进程内导入 Session 标记；dispose 时清空 |
| `src/import-session.ts` | 将净化事件持久化到当前 Workspace |
| `src/client/` | `client-ui-social` 挂载：好友面板、分享操作、文案、CSS |

## Mock 与 HTTP

已发布的唯一提供者是 `MockSocialBackend`。好友、申请与分享持久化在**单个 Host** 的 `$DSH_HOME` 上。需要两个账号身份的验收场景必须在该 Host 上使用两个已登录主体，且不得假定另一台机器的 Mock 文件会收到分享。

`HttpSocialBackend` 延后到平台 Social HTTP 契约存在之后（CODE_DESIGN T6）。

## 只读闸门

导入 Session 会调用 `SocialReadonlyRegistry.mark`。Host 对已标记 Session 拒绝 `agent/pre-step`，并暴露 `sessionIsReadonly` / `assertCanPrompt` 供 Client 与可选 Remote 消费。该路径**不**替代 `remote-access` ACL：在 remote-access 规则下 Session owner 仍被允许提示；社交标记是独立的产品闸门。
