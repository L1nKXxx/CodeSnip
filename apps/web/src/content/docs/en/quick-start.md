---
title: Quick start
description: Local development and static build (pnpm)
sidebar:
  group: Getting started
  order: 2
---

## Install dependencies

From the repository root:

```bash
pnpm install
```

## Run the marketing site

```bash
pnpm web:dev
```

## Build the site (static)

```bash
pnpm web:build
```

Output: `apps/web/dist/`.

## Run the desktop app (Rust/Cargo required)

```bash
pnpm desktop:dev
```
