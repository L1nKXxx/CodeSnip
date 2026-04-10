---
title: Install Rust/Cargo on Windows
description: Toolchain required for Tauri development
sidebar:
  group: Environment
  order: 1
---

Tauri development and packaging need the Rust toolchain (including `cargo`).

## Install Rust (rustup recommended)

1. Open the official installer page: `https://www.rust-lang.org/tools/install`
2. Download and run `rustup-init.exe`
3. Accept the defaults, then restart PowerShell
4. Verify:

```powershell
rustc --version
cargo --version
```

## Windows build prerequisites (if needed)

If the build complains about MSVC, install **Visual Studio Build Tools** with:

- Desktop development with C++
- Windows 10/11 SDK
