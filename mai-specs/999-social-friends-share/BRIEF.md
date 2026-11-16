# 999: 好友与只读会话分享

| 项 | 值 |
|---|---|
| Phase | draft |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | kyen |
| 目标日期 | 待填 |
| 涉及子系统 | credentials/deepseek-account, session-query, client UI, experimental bundle |

## 一句话描述

DeepSeek 账号下加好友，并将 Session 只读快照分享给好友打开。

## 背景

产品内 MVP：复用 DeepSeek 账号身份；好友关系与异步只读会话快照分享；角色/点赞/实时协同延后。有效需求来源为本会话确认（A+复用 DeepSeek 账号）。

## 关键决策

- 产品形态：现有 `dsh web/desktop` 上的 optional experimental bundle（默认关闭）。
- 身份：仅复用 DeepSeek 账号 `AccountUserId` / `getProfile`；匿名安装 id 不进入好友图。
- MVP：加好友 + Session 只读快照分享/收件箱打开；角色、点赞、实时协同不做。
- 与 Liveshare：本 Feature 走异步快照收件箱；实时协作仍属 Liveshare。
- **本阶段验收边界**：单 Host + `SocialBackend` Mock + 双 `AccountUserId` 夹具；**跨安装/真跨机以 T6 HttpSocialBackend（平台 API）为门禁**，Mock 通过不等于已具备多机社交。
- 阶段：已选 design；有效需求来源为本会话确认（A + 复用 DeepSeek 账号），无独立 PRD，AC 维护于 [design/TECH_DESIGN.md](design/TECH_DESIGN.md#需求依据与验收)。
- 设计评审：[review/design_review.md](review/design_review.md)

## 上下文索引

- [素材索引](context/_INDEX.md)
- [技术方案](design/TECH_DESIGN.md)
- [代码设计附录](design/CODE_DESIGN.md)
- [方案评审](review/design_review.md)
