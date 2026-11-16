# 999 技术方案评审

> Feature：[999-social-friends-share](../BRIEF.md) | 评审对象：[TECH_DESIGN.md](../design/TECH_DESIGN.md)、[CODE_DESIGN.md](../design/CODE_DESIGN.md) | 基线：方案内 `39163dd30f` | 场景：design-review | 状态：**通过**（复评）

## 总体结论

**通过。**

首轮「有条件通过」的三项条件均已在设计修订中落实：只读导入步骤可评审；Mock 单 Host 验收与 T6 跨机门禁已写入 BRIEF/AC；`searchUsers` 已删除并由粘贴 peerId + `PeerProfileStore` 拼装列表。修订还纠正了首轮建议中的偏差——**本地接收方是 owner，不能把 AC4 建立在 remote-access 非 owner policy 上**；现方案改为 `SocialReadonlyRegistry` + Host `session/prompt` 闸门，与 Gateway owner 恒放行事实一致，优于原建议。

无新的 P0。可进入实现（T1 起）；真跨机仍受 T6/平台 API 约束，属已接受的产品边界，不阻本阶段编码。

## 复评核对（原条件清单）

| 条件 | 结果 | 证据 |
| --- | --- | --- |
| P0 导入 API / cwd / 只读绑定 | **已关闭** | TECH §2.3.2 步骤 1–7；CODE §3 `openShare` + `assertCanPrompt`；选定 `sessions.create({ seed, meta.cwd })`，当前 Workspace cwd，失败回滚 |
| P1 Mock 验收边界 | **已关闭** | BRIEF 关键决策；TECH 验收边界段；CODE §5；T6 门禁 |
| P1 searchUsers / profile | **已关闭** | 删除 searchUsers；`FriendshipView` + `PeerProfileStore`；AC2 允许无名仅 id |
| P1 Workspace 归属 | **已关闭** | 当前选中 Workspace cwd；`SOCIAL_NO_WORKSPACE` |
| P2 blocked / getFriendship 注释 | **已关闭** | 无 blocked；`getFriendship` 注释改为任意边 |

## 需求对齐

| 项 | 判断 |
| --- | --- |
| BRIEF ↔ AC1–AC5 | 一致，且含 Mock/T6 产品条件 |
| 不做范围 | 含「无 searchUsers」，与 Remote 面一致 |
| 复用 create(seed) / flush | 与 `packages/core/session`、`session-log-export` 先例对齐 |
| Liveshare 边界 | 仍清晰 |

## 关键发现

### 已解决（首轮）

- ~~P0 导入空实现~~ → 已展开可执行步骤与回滚。
- ~~P1 Mock 被误读为多机~~ → 门禁文案到位。
- ~~P1 接口表漂移 / profile / Workspace~~ → 已统一。

### 本轮观察（不阻断）

#### P2 — Workspace catalog「显式挂入」仍点名实现对接

- **证据**：CODE §3 注释「若 Workspace catalog 需要显式登记…实现时对接」。
- **影响**：若当前产品 Session 列表不仅依赖 cwd 共置，实现 PR 须查清并调用既有 API；设计已要求失败则回滚，不致静默丢 Session。
- **动作**：T3/T4 实现前用只读探测确认 catalog 规则；不必再改方案才能开工。

#### P2 — sanitize 清单以原则 + 单测钉死

- **证据**：CODE §2.3。
- **动作**：实现时用夹具单测固定剔除字段；属实现纪律，非设计缺口。

## 减法

Backend 缝、experimental bundle、Host 只读闸门均服务当前 AC，建议保留。未重新引入 searchUsers/blocked/实时中继。

## 供评审代码质量

导入、好友相遇 accept、分享校验、体积上限、PeerProfile 拼装、`assertCanPrompt`：**可审**。`created?.dispose?.()` 为示意，实现须改用 SessionStore 正式移除 API——实现细节，不降级结论。

## 验证与测试缺口

仍建议编排 `my-create-test-plan`，至少含：双账号夹具；非好友分享；**openShare 后 owner 调用 prompt 仍被 Host 拒绝**；无 Workspace；Mock 重启。缺少 TEST_PLAN 不否决本设计通过。

## 保持现状

- T6 前无真跨机；不做点赞/角色/Liveshare 复用；附件 blob 后置。

## 历史

- 2026-11-16 首轮：有条件通过（见 git/对话；条件见上表）。
- 2026-11-16 复评：设计修订后 **通过**。

## 未覆盖

- 未跑实现代码；无 UI 视觉稿；平台 Social HTTP 仍不存在。
