---
description: "可选的好友关系与只读会话分享（DeepSeek 账号）。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-social-bundle

[English](README.md) | 中文

## 摘要

启用实验性好友与**只读会话快照**分享。本组合包插入 [`@deepseek-ai/dsh-social`](../social/README.md)。默认关闭；在插件页启用。Mock 后端为**单 Host** — 同一安装上的双账号夹具，不是跨机投递。

## 使用本包

在 Web 或 Desktop 打开插件，启用 **好友与分享**。使用 DeepSeek 账号登录后，在新建会话旁打开侧栏入口。

## 已知限制与延后工作

- Mock 存储位于单个 Host 的 `$DSH_HOME/social/`。
- 跨安装好友/分享需未来的 HTTP Social 后端。
- 不是 Liveshare；分享为异步文本副本。
