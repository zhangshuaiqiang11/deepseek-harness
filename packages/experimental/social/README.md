---
description: "Experimental friends graph and read-only session share inbox keyed by DeepSeek account identity."
kind: "package-reference"
---

# @deepseek-ai/dsh-social

English | [中文](README.zh.md)

## Summary

Optional experimental friends list and **read-only session snapshot** sharing for signed-in DeepSeek accounts. The default backend is a **single-Host Mock** store under `$DSH_HOME/social/`. Cross-install / multi-device delivery requires a future HTTP Social backend and is **not** claimed by Mock acceptance.

Enable through the [`social-bundle`](../social-bundle/README.md). Shipped profiles do not load this package by default. Implementation notes: [DETAIL](docs/DETAIL.md).

## Use this package

1. Enable `@deepseek-ai/dsh-social-bundle` on a profile (Plugins → Experimental, or `dsh.profile.bundles`).
2. Sign in with a DeepSeek account.
3. Open **Friends and shares** from the sidebar (next to New session): paste a peer account id, accept requests, open inbox shares.
4. From a conversation header, **Share with friend** sends a text-event snapshot (not a live Liveshare session).

Mock acceptance: dual `AccountUserId` fixtures against one Host/Mock file. Two separate installs do not share Mock data.

## Model Experience

None. Social APIs never enter model prompts or Session tool results.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

- **Mock is single-Host only** — cross-machine friends/shares need `HttpSocialBackend` (T6) once a platform Social HTTP API exists.
- **No user search** — peers are addressed by pasted `AccountUserId` only.
- **No attachment blobs** in shares — images may appear missing on open.
- **Owner `session/prompt`** is not rewritten inside `session-controller`; imported Sessions register a read-only mark, hide Composer via `sessionIsReadonly`, and reject `agent/pre-step`. Compositions that need a hard Remote prompt deny should call `ctx.social.assertCanPrompt(sessionId)`.
- **Not Liveshare** — this sends an asynchronous copy; live collaboration remains the Liveshare experimental bundle.
