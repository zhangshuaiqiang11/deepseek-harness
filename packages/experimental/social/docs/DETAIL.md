---
description: "Host/Client layout, Mock SocialBackend, and read-only share gates for dsh-social."
kind: "package-detail"
---

# @deepseek-ai/dsh-social detail

English | [中文](DETAIL.zh.md)

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | `SocialService`: Remotes, share/import, `agent/pre-step` reject, `sessionIsReadonly` |
| `src/backend.ts` | `SocialBackend` + `MockSocialBackend` (`$DSH_HOME/social/mock-store.json`) |
| `src/peer-profile.ts` | Cached `getProfile` for friend / inbox labels |
| `src/sanitize.ts` | Text-only event filter for share payloads |
| `src/readonly-registry.ts` | Process-local imported Session marks; cleared on dispose |
| `src/import-session.ts` | Persist sanitized events into the active Workspace |
| `src/client/` | `client-ui-social` mount: Friends panel, Share action, locales, CSS |

## Mock vs HTTP

`MockSocialBackend` is the only shipped provider. Friends, requests, and shares are durable on **one Host's** `$DSH_HOME`. Acceptance scenarios that need two account identities must use two signed-in subjects against that Host; they must not assume another machine's Mock file receives the share.

`HttpSocialBackend` is deferred (CODE_DESIGN T6) until a platform Social HTTP contract exists.

## Read-only gate

Imported Sessions call `SocialReadonlyRegistry.mark`. The Host rejects `agent/pre-step` for marked Sessions and exposes `sessionIsReadonly` / `assertCanPrompt` for Client and optional Remote consumers. This path does **not** replace `remote-access` ACL: the Session owner remains allowed to prompt under remote-access rules; the social mark is a separate product gate.
