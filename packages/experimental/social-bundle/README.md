---
description: "Optional friends graph and read-only session share for DeepSeek accounts."
kind: "package-bundle"
---

# @deepseek-ai/dsh-social-bundle

English | [中文](README.zh.md)

## Summary

Enable experimental friends and **read-only session snapshot** sharing. This bundle inserts [`@deepseek-ai/dsh-social`](../social/README.md). It ships switched off; select it in Plugins to enable. The Mock backend is **single-Host only** — dual-account fixtures on one install, not cross-machine delivery.

## Use this package

In Web or Desktop, open Plugins and enable **Friends and shares**. Sign in with a DeepSeek account, then use the sidebar action next to New session.

## Known Limitations and Deferred Work

- Mock store lives under `$DSH_HOME/social/` on one Host.
- Cross-install friends/shares need a future HTTP Social backend.
- Not Liveshare; shares are asynchronous text copies.
