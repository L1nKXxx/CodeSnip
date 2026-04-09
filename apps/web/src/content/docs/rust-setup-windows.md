---
title: Windows 安装 Rust/Cargo
description: Tauri 开发必需的工具链安装说明
sidebar:
  group: 环境
  order: 1
---

Tauri 的开发与打包依赖 Rust 工具链（含 `cargo`）。

## 安装 Rust（推荐 rustup）

1. 打开 Rust 官方安装页：`https://www.rust-lang.org/tools/install`
2. 下载并运行 `rustup-init.exe`
3. 按默认选项安装完成后，重开 PowerShell
4. 验证：

```powershell
rustc --version
cargo --version
```

## Windows 编译依赖（可能需要）

如果后续构建报错提示缺少 MSVC 工具链，安装 **Visual Studio Build Tools** 并勾选：

- Desktop development with C++
- Windows SDK（10/11）

