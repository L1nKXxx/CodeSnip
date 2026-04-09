# CodeSnip（monorepo）

本仓库包含两个应用：

- **桌面端**：`apps/desktop`（Tauri + Next.js）——透明/置顶/无边框贴图窗口，增强“代码粘贴”高亮展示
- **官网**：`apps/web`（Astro 静态站点）——产品介绍、特性与文档

## 开发环境要求（桌面端）

- Node.js（当前项目已在 Node 20.x 下验证）
- Rust + Cargo（Tauri 必需）
  - Rust 官方安装页：`https://www.rust-lang.org/tools/install`
  - 安装完成后验证：`cargo --version`
- Windows 推荐安装 Visual Studio Build Tools（C++ Desktop + Windows SDK）

## 常用命令（根目录）

```bash
# 官网
pnpm web:dev
pnpm web:build

# 桌面端（需要 Rust/Cargo）
pnpm desktop:dev
pnpm desktop:build

# 检查
pnpm lint
```

## 构建产物

- **官网**：`apps/web/dist/`（静态文件）
- **桌面端**：由 Tauri 生成安装包/可执行文件（`apps/desktop/src-tauri/target/...`）

