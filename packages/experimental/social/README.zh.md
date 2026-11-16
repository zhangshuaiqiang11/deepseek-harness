---
description: "实验性好友关系与只读会话分享收件箱，身份绑定 DeepSeek 账号。"
kind: "package-reference"
---

# @deepseek-ai/dsh-social

[English](README.md) | 中文

## 摘要

可选实验能力：已登录 DeepSeek 账号下的好友列表与**只读会话快照**分享。默认后端是 `$DSH_HOME/social/` 下的**单 Host Mock** 存储。跨安装 / 多设备投递需要未来的 HTTP Social 后端，**不在** Mock 验收范围内。

通过 [`social-bundle`](../social-bundle/README.md) 启用；已发布 profile 默认不加载本包。实现说明见 [DETAIL](docs/DETAIL.zh.md)。

## 使用本包

1. 在 profile 上启用 `@deepseek-ai/dsh-social-bundle`（插件 → 实验，或 `dsh.profile.bundles`）。
2. 使用 DeepSeek 账号登录。
3. 侧栏 **好友与分享**（新建会话旁）：粘贴对方账号 id、接受申请、打开收件箱分享。
4. 会话顶栏 **分享给好友** 发送文本事件快照（不是 Liveshare 实时会话）。

Mock 验收：同一 Host / Mock 文件上用两个 `AccountUserId` 夹具。两套独立安装不共享 Mock 数据。

## 模型体验

无。Social API 不进入模型提示或 Session 工具结果。

#### KV Cache 影响

不改变模型请求前缀。

## 已知限制与延后工作

- **Mock 仅单 Host** — 跨机好友/分享需平台 Social HTTP API 落地后的 `HttpSocialBackend`（T6）。
- **无用户搜索** — 仅通过粘贴的 `AccountUserId` 定位对方。
- **分享不含附件 blob** — 打开后图片等可能缺失。
- **不改写 owner 的 `session/prompt`**；导入会话登记只读标记，Client 用 `sessionIsReadonly` 隐藏 Composer，并拒绝 `agent/pre-step`。需要 Remote 硬拒绝提示的组合应调用 `ctx.social.assertCanPrompt(sessionId)`。
- **不是 Liveshare** — 本能力发送异步副本；实时协作仍用 Liveshare 实验包。
