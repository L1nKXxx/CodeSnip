---
title: 快速开始
description: 本地开发与构建流程（pnpm）
sidebar:
  group: 开始
  order: 2
---

## 安装依赖

在仓库根目录：

```bash
pnpm install
```

## 启动官网

```bash
pnpm web:dev
```

## 构建官网（静态）

```bash
pnpm web:build
```

产物在 `apps/web/dist/`。

## 启动桌面端（需要 Rust/Cargo）

```bash
pnpm desktop:dev
```
